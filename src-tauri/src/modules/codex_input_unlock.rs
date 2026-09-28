// Runtime-only adaptation of 1zero224/codex-input-unlock.
// Locator pinned at fbc04a3032766918556168d9b27e74da8d863bb1; MIT license is
// shipped in public/licenses/CodexInputUnlock-LICENSE.txt.
// No official files, query caches, or server quota values are changed.
const INPUT_UNLOCK_GATE: &str = include_str!("codex_input_unlock_gate.cjs");
type UnlockSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

fn profile_input_unlock_enabled(instance_id: &str, launch_bind: Option<&str>, dir: &Path) -> bool {
    let Ok(store) = crate::modules::codex_instance::load_instance_store() else {
        return false;
    };
    let (mode, current_bind) = if instance_id == "__default__" {
        let settings = store.default_settings;
        let bind = if settings.follow_local_account {
            codex_account::get_current_account().map(|account| account.id)
        } else {
            settings.bind_account_id
        };
        (settings.launch_mode, bind)
    } else {
        let Some(profile) = store.instances.into_iter().find(|p| p.id == instance_id) else {
            return false;
        };
        (profile.launch_mode, profile.bind_account_id)
    };
    if mode != crate::models::InstanceLaunchMode::App || current_bind.as_deref() != launch_bind {
        return false;
    }
    if supports_bind_account(current_bind.as_deref()) {
        return true;
    }
    profile_has_managed_api_service(dir)
}

fn profile_has_managed_api_service(dir: &Path) -> bool {
    // Recognize an existing Cockpit takeover, not an arbitrary localhost provider.
    let Ok(content) = fs::read_to_string(dir.join("config.toml")) else {
        return false;
    };
    managed_api_service_config(&content)
}

fn managed_api_service_config(content: &str) -> bool {
    let Ok(doc) = content.parse::<Document>() else {
        return false;
    };
    if doc.get("model_provider").and_then(|v| v.as_str()) != Some("codex_local_access") {
        return false;
    }
    let Some(provider) = doc
        .get("model_providers")
        .and_then(|v| v.as_table())
        .and_then(|v| v.get("codex_local_access"))
        .and_then(|v| v.as_table())
    else {
        return false;
    };
    let managed_key = provider
        .get("experimental_bearer_token")
        .and_then(|v| v.as_str())
        .is_some_and(|v| v.starts_with("agt_codex_"));
    let local = provider
        .get("base_url")
        .and_then(|v| v.as_str())
        .and_then(|v| reqwest::Url::parse(v).ok())
        .is_some_and(|v| matches!(v.host_str(), Some("127.0.0.1" | "localhost" | "[::1]")));
    managed_key && local
}

pub fn should_enable_cdp_for_profile(bind: Option<&str>, hide: bool, dir: &Path) -> bool {
    should_enable_cdp(bind, hide) || profile_has_managed_api_service(dir)
}

fn unlock_log(instance: &str, state: &str) {
    logger::log_codex_quota_diagnostic(&format!("[Input Unlock] instance={} {}", instance, state));
}

struct UnlockCdp {
    socket: UnlockSocket,
    sequence: u64,
    scripts: std::collections::VecDeque<(String, String)>,
    seen_scripts: HashSet<String>,
    reset: bool,
    last_command: String,
}
impl UnlockCdp {
    fn event(&mut self, value: &Value) {
        match value.get("method").and_then(Value::as_str) {
            Some("Debugger.scriptParsed") => {
                let p = &value["params"];
                if let (Some(id), Some(url)) = (p["scriptId"].as_str(), p["url"].as_str()) {
                    if url.starts_with("app://")
                        && url.ends_with(".js")
                        && self.seen_scripts.insert(id.to_owned())
                    {
                        self.scripts.push_back((id.to_owned(), url.to_owned()));
                    }
                }
            }
            Some("Runtime.executionContextsCleared" | "Debugger.globalObjectCleared") => {
                self.reset = true
            }
            _ => {}
        }
    }

    async fn call(&mut self, method: &str, params: Value) -> Result<Value, &'static str> {
        self.last_command = method.to_string();
        self.sequence += 1;
        let id = self.sequence;
        timeout(Duration::from_secs(15), async {
            self.socket
                .send(Message::Text(
                    json!({"id":id,"method":method,"params":params})
                        .to_string()
                        .into(),
                ))
                .await
                .map_err(|_| "cdp_send_failed")?;
            while let Some(message) = self.socket.next().await {
                let message = message.map_err(|_| "cdp_disconnected")?;
                if let Message::Text(text) = message {
                    let Ok(value) = serde_json::from_str::<Value>(&text) else {
                        continue;
                    };
                    if value.get("id").and_then(Value::as_u64) == Some(id) {
                        if value.get("error").is_some() {
                            return Err("cdp_command_error");
                        }
                        if value.pointer("/result/exceptionDetails").is_some() {
                            return Err("cdp_evaluation_error");
                        }
                        return Ok(value["result"].clone());
                    }
                    self.event(&value);
                }
            }
            Err("cdp_disconnected")
        })
        .await
        .map_err(|_| "cdp_timeout")?
    }
}

fn unlock_condition(location: &Value) -> Option<String> {
    fn identifier(value: &str) -> bool {
        let mut chars = value.chars();
        chars
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
            && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
    }
    let quota = location["quotaVariable"]
        .as_str()
        .filter(|v| identifier(v))?;
    match location["mode"].as_str()? {
        "codex-local-quota" | "legacy-local-host" => Some(format!("({quota}=false,false)")),
        "third-party-composer-dual" => {
            let other = location["conversationQuotaVariable"]
                .as_str()
                .filter(|v| identifier(v))?;
            Some(format!("({other}=false,{quota}=false,false)"))
        }
        _ => None,
    }
}

async fn unlock_actual_location(
    cdp: &mut UnlockCdp,
    script: &str,
    desired: &Value,
) -> Result<Value, &'static str> {
    let line = desired["lineNumber"].as_u64().ok_or("invalid_location")?;
    let column = desired["columnNumber"].as_u64().ok_or("invalid_location")?;
    let bounded = desired["endLineNumber"]
        .as_u64()
        .zip(desired["endColumnNumber"].as_u64());
    for radius in [300_u64, 2000] {
        let (end_line, end_column) = bounded.unwrap_or((line, column + radius));
        let result = cdp
            .call(
                "Debugger.getPossibleBreakpoints",
                json!({
                    "start":{"scriptId":script,"lineNumber":line,"columnNumber":column},
                    "end":{"scriptId":script,"lineNumber":end_line,"columnNumber":end_column},
                    "restrictToFunction":true,
                }),
            )
            .await?;
        let mut locations: Vec<Value> = result["locations"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|p| p["scriptId"].as_str() == Some(script))
            .filter(|p| {
                let pos = (
                    p["lineNumber"].as_u64().unwrap_or(u64::MAX),
                    p["columnNumber"].as_u64().unwrap_or(u64::MAX),
                );
                pos >= (line, column) && pos <= (end_line, end_column)
            })
            .cloned()
            .collect();
        locations.sort_by_key(|p| (p["lineNumber"].as_u64(), p["columnNumber"].as_u64()));
        if let Some(value) = locations.into_iter().next() {
            return Ok(value);
        }
        if bounded.is_some() {
            break;
        }
    }
    Err("no_executable_quota_location")
}

async fn unlock_target_loop(
    cdp: &mut UnlockCdp,
    instance: &str,
    breakpoints: &mut Vec<String>,
) -> Result<(), &'static str> {
    cdp.call("Runtime.enable", json!({})).await?;
    cdp.call("Debugger.enable", json!({})).await?;
    cdp.reset = false;
    let mut last_heartbeat = Instant::now();
    let mut last_discovery = Instant::now();
    let mut installed = false;
    loop {
        if cdp.reset {
            return Err("renderer_reloaded");
        }
        if !installed {
            if let Some((id, url)) = cdp.scripts.pop_front() {
                let result = cdp
                    .call("Debugger.getScriptSource", json!({"scriptId":id}))
                    .await?;
                if let Some(source) = result["scriptSource"]
                    .as_str()
                    .filter(|s| s.len() <= 24 * 1024 * 1024)
                {
                    if source.contains("submitDisabled:") && source.contains("authMethod") {
                        // Run the pure upstream parser in a local JS scope. Do not publish
                        // bootstrap globals or leave new-document injection behind.
                        let expression = format!(
                            "(() => {{const globalThis={{}};const module={{exports:{{}}}};{};return module.exports.locate({},{});}})()",
                            INPUT_UNLOCK_GATE, json!(source), json!(url),
                        );
                        let located = cdp
                            .call(
                                "Runtime.evaluate",
                                json!({"expression":expression,"returnByValue":true}),
                            )
                            .await?;
                        let desired = &located["result"]["value"];
                        if let Some(condition) = unlock_condition(desired) {
                            let actual = unlock_actual_location(cdp, &id, desired).await?;
                            let response = cdp
                                .call(
                                    "Debugger.setBreakpoint",
                                    json!({"location":actual,"condition":condition}),
                                )
                                .await?;
                            let breakpoint = response["breakpointId"]
                                .as_str()
                                .ok_or("breakpoint_not_resolved")?;
                            if response["actualLocation"].is_null() {
                                return Err("breakpoint_not_resolved");
                            }
                            breakpoints.push(breakpoint.to_owned());
                            installed = true;
                            unlock_log(instance, &format!("state=armed mode={} line={} column={} target_scope=local-api-service",
                                desired["mode"].as_str().unwrap_or("unknown"),
                                response["actualLocation"]["lineNumber"], response["actualLocation"]["columnNumber"]));
                            // Recompute on the next normal interaction without refreshing or
                            // submitting anything. Existing text/input contents stay intact.
                            cdp.call("Runtime.evaluate", json!({"expression":
                                "window.dispatchEvent(new Event('focus')); true", "returnByValue":true})).await?;
                        }
                    }
                }
                continue;
            }
        }
        // Pump CDP events even when no new script is being examined.
        cdp.call(
            "Runtime.evaluate",
            json!({"expression":"true","returnByValue":true}),
        )
        .await?;
        if !installed && last_discovery.elapsed() >= Duration::from_secs(30) {
            unlock_log(
                instance,
                &format!(
                    "state=not-matched reason=unsupported-or-not-yet-loaded-bundle scripts_seen={}",
                    cdp.seen_scripts.len()
                ),
            );
            last_discovery = Instant::now();
        }
        if installed && last_heartbeat.elapsed() >= Duration::from_secs(60) {
            unlock_log(instance, "state=armed heartbeat=ok");
            last_heartbeat = Instant::now();
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

async fn run_unlock_target(
    target: CdpTarget,
    instance: String,
    mut cancel: tokio::sync::watch::Receiver<bool>,
) {
    if *cancel.borrow() {
        return;
    }
    let Some(url) = target.websocket_url.as_deref() else {
        return;
    };
    let target_label: String = target
        .target_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(80)
        .collect();
    let instance = format!("{instance} target={target_label}");
    let connected = tokio::select! {
        _ = cancel.changed() => return,
        value = timeout(CDP_CONNECT_TIMEOUT, connect_async(url)) => value,
    };
    let Ok(Ok((socket, _))) = connected else {
        unlock_log(&instance, "state=retry reason=cdp_connect_failed");
        return;
    };
    let mut cdp = UnlockCdp {
        socket,
        sequence: 0,
        scripts: Default::default(),
        seen_scripts: HashSet::new(),
        reset: false,
        last_command: String::new(),
    };
    let mut breakpoints = Vec::new();
    let result = tokio::select! {
        biased;
        _ = cancel.changed() => Ok(()),
        value = unlock_target_loop(&mut cdp, &instance, &mut breakpoints) => value,
    };
    if let Err(reason) = result {
        unlock_log(
            &instance,
            &format!("state=retry reason={reason} command={}", cdp.last_command),
        );
    }
    // Disconnect also releases debugger-owned breakpoints if the target no longer
    // accepts commands. Bound cleanup so stopping a profile cannot hang.
    let _ = timeout(Duration::from_secs(3), async {
        for id in breakpoints {
            let _ = cdp
                .call("Debugger.removeBreakpoint", json!({"breakpointId":id}))
                .await;
        }
        let _ = cdp.call("Debugger.disable", json!({})).await;
        let _ = cdp.socket.close(None).await;
    })
    .await;
    unlock_log(&instance, "state=disconnected breakpoints=released");
}

async fn run_input_unlock_supervisor(
    instance: String,
    profile_dir: PathBuf,
    port: u16,
    bind: Option<String>,
    mut cancel: tokio::sync::watch::Receiver<bool>,
) {
    let client = Client::new();
    let mut targets: HashMap<
        String,
        (
            tokio::sync::watch::Sender<bool>,
            tokio::task::JoinHandle<()>,
        ),
    > = HashMap::new();
    let mut last_status = String::new();
    loop {
        if *cancel.borrow() || app_lifecycle::is_shutdown_started() {
            break;
        }
        let enabled = profile_input_unlock_enabled(&instance, bind.as_deref(), &profile_dir);
        let found = if enabled {
            query_targets(&client, port).await
        } else {
            Vec::new()
        };
        let found: Vec<_> = found
            .into_iter()
            .filter(is_codex_app_target)
            .filter(|t| t.websocket_url.is_some())
            .collect();
        let status = format!("enabled={enabled} targets={}", found.len());
        if status != last_status {
            unlock_log(&instance, &status);
            last_status = status;
        }
        let keys: HashSet<_> = found
            .iter()
            .map(|t| t.websocket_url.clone().unwrap())
            .collect();
        let removed: Vec<_> = targets
            .iter()
            .filter(|(key, (_, task))| !keys.contains(*key) || task.is_finished())
            .map(|(key, _)| key.clone())
            .collect();
        for key in removed {
            if let Some((stop, task)) = targets.remove(&key) {
                stop.send_replace(true);
                let _ = task.await;
            }
        }
        for target in found {
            let key = target.websocket_url.clone().unwrap();
            targets.entry(key).or_insert_with(|| {
                let (stop, rx) = tokio::sync::watch::channel(false);
                let task = tokio::spawn(run_unlock_target(target, instance.clone(), rx));
                (stop, task)
            });
        }
        tokio::select! {
            _ = cancel.changed() => break,
            _ = tokio::time::sleep(Duration::from_secs(3)) => {}
        }
    }
    for (_, (stop, task)) in targets {
        stop.send_replace(true);
        let _ = task.await;
    }
    unlock_log(&instance, "state=stopped");
}

#[cfg(test)]
mod input_unlock_tests {
    use super::*;
    #[test]
    fn managed_routes_are_not_arbitrary_localhost_providers() {
        let managed = "model_provider='codex_local_access'\n[model_providers.codex_local_access]\nbase_url='http://127.0.0.1:1234/v1'\nexperimental_bearer_token='agt_codex_test'";
        assert!(managed_api_service_config(managed));
        assert!(!managed_api_service_config(
            &managed.replace("127.0.0.1", "example.com")
        ));
        assert!(!managed_api_service_config(
            &managed.replace("agt_codex_test", "ordinary-key")
        ));
        assert!(!managed_api_service_config(&managed.replace(
            "model_provider='codex_local_access'",
            "model_provider='other'"
        )));
        assert!(should_enable_cdp(Some("__api_service__"), false));
        assert!(should_enable_cdp(Some("codex_local_access_runtime"), false));
    }
    #[test]
    fn only_local_quota_identifiers_are_assigned() {
        assert_eq!(
            unlock_condition(&json!({"mode":"codex-local-quota","quotaVariable":"nn"})),
            Some("(nn=false,false)".into())
        );
        assert_eq!(
            unlock_condition(
                &json!({"mode":"third-party-composer-dual","quotaVariable":"quota","conversationQuotaVariable":"conversation"})
            ),
            Some("(conversation=false,quota=false,false)".into())
        );
        assert!(unlock_condition(&json!({"mode":"unknown","quotaVariable":"nn"})).is_none());
        assert!(
            unlock_condition(&json!({"mode":"codex-local-quota","quotaVariable":"x);bad()"}))
                .is_none()
        );
    }

    #[tokio::test]
    async fn cdp_events_survive_commands_and_errors_do_not_leak_bodies() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let request: Value =
                serde_json::from_str(&socket.next().await.unwrap().unwrap().into_text().unwrap())
                    .unwrap();
            socket.send(Message::Text(json!({"method":"Debugger.scriptParsed","params":{"scriptId":"one","url":"app://-/assets/app.js"}}).to_string().into())).await.unwrap();
            socket
                .send(Message::Text(
                    json!({"id":request["id"],"error":{"message":"secret-data-do-not-log"}})
                        .to_string()
                        .into(),
                ))
                .await
                .unwrap();
        });
        let (socket, _) = connect_async(format!("ws://{address}")).await.unwrap();
        let mut cdp = UnlockCdp {
            socket,
            sequence: 0,
            scripts: Default::default(),
            seen_scripts: HashSet::new(),
            reset: false,
            last_command: String::new(),
        };
        assert_eq!(
            cdp.call("Debugger.enable", json!({})).await.unwrap_err(),
            "cdp_command_error"
        );
        assert_eq!(
            cdp.scripts.pop_front(),
            Some(("one".into(), "app://-/assets/app.js".into()))
        );
        server.await.unwrap();
    }

    #[tokio::test]
    async fn cancellation_removes_the_owned_breakpoint() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (ready, armed) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let mut ready = Some(ready);
            let mut removed = false;
            while let Some(Ok(Message::Text(message))) = socket.next().await {
                let request: Value = serde_json::from_str(&message).unwrap();
                let method = request["method"].as_str().unwrap();
                let result = match method {
                    "Debugger.enable" => {
                        socket.send(Message::Text(json!({"method":"Debugger.scriptParsed","params":{"scriptId":"one","url":"app://-/assets/app.js"}}).to_string().into())).await.unwrap();
                        json!({})
                    }
                    "Debugger.getScriptSource" => {
                        json!({"scriptSource":"authMethod submitDisabled:"})
                    }
                    "Runtime.evaluate"
                        if request["params"]["expression"]
                            .as_str()
                            .unwrap()
                            .contains("module.exports.locate") =>
                    {
                        json!({"result":{"value":{"mode":"codex-local-quota","quotaVariable":"quota","lineNumber":0,"columnNumber":10,"endLineNumber":0,"endColumnNumber":20}}})
                    }
                    "Debugger.getPossibleBreakpoints" => {
                        json!({"locations":[{"scriptId":"one","lineNumber":0,"columnNumber":12}]})
                    }
                    "Debugger.setBreakpoint" => {
                        assert_eq!(request["params"]["condition"], "(quota=false,false)");
                        json!({"breakpointId":"owned","actualLocation":{"scriptId":"one","lineNumber":0,"columnNumber":12}})
                    }
                    "Debugger.removeBreakpoint" => {
                        assert_eq!(request["params"]["breakpointId"], "owned");
                        removed = true;
                        json!({})
                    }
                    _ => json!({"result":{"value":true}}),
                };
                socket
                    .send(Message::Text(
                        json!({"id":request["id"],"result":result})
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
                if method == "Runtime.evaluate"
                    && request["params"]["expression"]
                        .as_str()
                        .unwrap_or("")
                        .starts_with("window.dispatchEvent")
                {
                    if let Some(ready) = ready.take() {
                        let _ = ready.send(());
                    }
                }
                if method == "Debugger.disable" {
                    break;
                }
            }
            removed
        });
        let (cancel, rx) = tokio::sync::watch::channel(false);
        let target = CdpTarget {
            target_id: "test".into(),
            target_type: "page".into(),
            url: "app://-/index.html".into(),
            websocket_url: Some(format!("ws://{address}")),
        };
        let worker = tokio::spawn(run_unlock_target(target, "test".into(), rx));
        timeout(Duration::from_secs(5), armed)
            .await
            .unwrap()
            .unwrap();
        cancel.send_replace(true);
        timeout(Duration::from_secs(5), worker)
            .await
            .unwrap()
            .unwrap();
        assert!(server.await.unwrap());
    }
}
