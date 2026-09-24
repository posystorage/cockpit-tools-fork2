// Explicit, single-account/model probes. Never change the active account or fall back.
const FINGERPRINT_TIMEOUT: Duration = Duration::from_secs(240);
const FINGERPRINT_MODELS: &[&str] = &[
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
];
struct FingerprintRun {
    id: String,
    cancel: watch::Sender<bool>,
    slots: Arc<Semaphore>,
}
static FINGERPRINT_RUN: std::sync::LazyLock<Mutex<Option<FingerprintRun>>> =
    std::sync::LazyLock::new(|| Mutex::new(None));

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum FingerprintTarget {
    Account {
        account_id: String,
    },
    Provider {
        base_url: String,
        api_key: String,
        wire_api: String,
    },
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintProbe {
    reply: String,
    response_model: Option<String>,
    response_id: Option<String>,
}

#[tauri::command]
pub fn codex_fingerprint_begin(run_id: String, concurrency: usize) -> Result<(), String> {
    if uuid::Uuid::parse_str(&run_id).is_err() || !(1..=10).contains(&concurrency) {
        return Err("无效的指纹测试参数".into());
    }
    let mut current = FINGERPRINT_RUN.lock().map_err(|_| "指纹测试状态不可用")?;
    // A page reload can leave an orphan run. A new explicit start cancels it.
    if let Some(previous) = current.take() {
        let _ = previous.cancel.send(true);
    }
    let (cancel, _) = watch::channel(false);
    *current = Some(FingerprintRun {
        id: run_id,
        cancel,
        slots: Arc::new(Semaphore::new(concurrency)),
    });
    Ok(())
}

#[tauri::command]
pub fn codex_fingerprint_cancel(run_id: String) -> Result<(), String> {
    let current = FINGERPRINT_RUN.lock().map_err(|_| "指纹测试状态不可用")?;
    if let Some(run) = current.as_ref().filter(|run| run.id == run_id) {
        run.cancel.send_replace(true);
    }
    Ok(())
}

#[tauri::command]
pub fn codex_fingerprint_finish(run_id: String) -> Result<(), String> {
    let mut current = FINGERPRINT_RUN.lock().map_err(|_| "指纹测试状态不可用")?;
    if current.as_ref().is_some_and(|run| run.id == run_id) {
        if let Some(run) = current.take() {
            run.cancel.send_replace(true);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn codex_fingerprint_probe(
    run_id: String,
    target: FingerprintTarget,
    model: String,
    prompt: String,
) -> Result<FingerprintProbe, String> {
    if !FINGERPRINT_MODELS.contains(&model.as_str()) || prompt.is_empty() || prompt.len() > 16000 {
        return Err("无效的指纹测试模型或题目".into());
    }
    let (mut cancel, slots) = {
        let current = FINGERPRINT_RUN.lock().map_err(|_| "指纹测试状态不可用")?;
        let run = current
            .as_ref()
            .filter(|run| run.id == run_id)
            .ok_or("指纹测试已结束")?;
        (run.cancel.subscribe(), run.slots.clone())
    };
    if *cancel.borrow() {
        return Err("指纹测试已取消".into());
    }
    tokio::select! {
        biased;
        _ = cancel.changed() => Err("指纹测试已取消".into()),
        result = timeout(FINGERPRINT_TIMEOUT, async {
            let _slot = slots.acquire_owned().await.map_err(|_| "指纹调度器已关闭")?;
            match target {
                FingerprintTarget::Account { account_id } => fingerprint_account_probe(&account_id, &model, &prompt).await,
                FingerprintTarget::Provider { base_url, api_key, wire_api } =>
                    fingerprint_provider_probe(&base_url, &api_key, &wire_api, &model, &prompt).await,
            }
        }) => result.map_err(|_| "指纹请求超时（240 秒）".to_string())?,
    }
}

fn fingerprint_response_body(model: &str, prompt: &str) -> Value {
    json!({"model":model, "input":[{"role":"user","content":[{"type":"input_text","text":prompt}]}],
        "instructions":"", "store":false, "stream":true})
}

fn fingerprint_oauth_request(
    model: &str,
    prompt: &str,
    account_id: &str,
) -> Result<(Vec<u8>, HashMap<String, String>), String> {
    let (raw, mut headers) = build_pelican_request(model, "medium", prompt, account_id)?;
    let mut body: Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
    // Every sample is independent, including from concurrent Pelican tests.
    let session = uuid::Uuid::new_v4().to_string();
    let turn = uuid::Uuid::new_v4().to_string();
    body["instructions"] = Value::String(String::new());
    body["prompt_cache_key"] = Value::String(session.clone());
    body["client_metadata"]["x-codex-window-id"] = Value::String(format!("{session}:0"));
    body["client_metadata"]["x-codex-turn-metadata"] =
        Value::String(build_codex_turn_metadata(&session, &turn));
    for header in ["session-id", "conversation_id", "x-client-request-id"] {
        headers.insert(header.to_string(), session.clone());
    }
    Ok((
        serde_json::to_vec(&body).map_err(|e| e.to_string())?,
        headers,
    ))
}

async fn fingerprint_account_probe(
    account_id: &str,
    model: &str,
    prompt: &str,
) -> Result<FingerprintProbe, String> {
    let _permit = acquire_internal_request_permit(account_id).await?;
    let id = account_id.to_owned();
    let runtime = tokio::runtime::Handle::current();
    let preparation = PELICAN_PREPARATION_SLOTS
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| "账号准备已停止")?;
    let account = tokio::task::spawn_blocking(move || {
        let _permit = preparation;
        runtime.block_on(async {
            timeout(Duration::from_secs(85), get_prepared_account(&id))
                .await
                .map_err(|_| "账号准备超时".to_string())?
        })
    })
    .await
    .map_err(|e| format!("账号准备失败: {e}"))??;
    if account.is_web_session_auth() {
        return Err("此账号不支持模型请求".into());
    }
    if account.is_api_key_auth() {
        return fingerprint_provider_probe(
            account
                .api_base_url
                .as_deref()
                .unwrap_or("https://api.openai.com/v1"),
            account.openai_api_key.as_deref().unwrap_or_default(),
            account.api_wire_api.as_deref().unwrap_or("responses"),
            model,
            prompt,
        )
        .await;
    }
    let (bytes, mut headers) = fingerprint_oauth_request(model, prompt, account_id)?;
    for name in CODEX_OFFICIAL_EMPTY_HEADERS {
        headers.entry((*name).to_string()).or_default();
    }
    if account
        .agent_identity
        .as_ref()
        .is_some_and(|identity| identity.chatgpt_account_is_fedramp)
    {
        headers.insert("x-openai-fedramp".into(), "true".into());
    }
    let response = send_internal_api_service_request(
        account_id,
        RESPONSES_PATH,
        &headers,
        &bytes,
        FINGERPRINT_TIMEOUT,
    )
    .await?;
    if !response.status().is_success() {
        let status = response.status();
        let raw = pelican_read_error_body(response).await?;
        let safe = pelican_redact_error(&account, &raw);
        let message = extract_upstream_error_message(&safe).unwrap_or_else(|| status.to_string());
        return Err(format!(
            "HTTP {}: {}",
            status.as_u16(),
            truncate_diagnostic_text(&message, 1200)
        ));
    }
    let output = pelican_consume_response(response, PELICAN_IDLE_TIMEOUT, &|_| {}).await?;
    Ok(FingerprintProbe {
        reply: output.reply,
        response_model: output.response_model,
        response_id: output.response_id,
    })
}

fn fingerprint_endpoint(base_url: &str, wire_api: &str) -> Result<Url, String> {
    let suffix = match wire_api {
        "responses" => "/responses",
        "chat_completions" => "/chat/completions",
        _ => return Err("不支持的上游协议".into()),
    };
    let mut url = Url::parse(base_url.trim()).map_err(|_| "无效的上游地址")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("上游地址必须为 HTTP(S)，且不能包含账号密码".into());
    }
    let path = url.path().trim_end_matches('/');
    let base = path
        .strip_suffix("/chat/completions")
        .or_else(|| path.strip_suffix("/responses"))
        .unwrap_or(path);
    let path = format!("{}{}", if base.is_empty() { "/v1" } else { base }, suffix);
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

async fn fingerprint_provider_probe(
    base_url: &str,
    api_key: &str,
    wire_api: &str,
    model: &str,
    prompt: &str,
) -> Result<FingerprintProbe, String> {
    if api_key.trim().is_empty() {
        return Err("上游缺少 API Key".into());
    }
    let url = fingerprint_endpoint(base_url, wire_api)?;
    let body = if wire_api == "responses" {
        fingerprint_response_body(model, prompt)
    } else {
        // Match ModelTrace's provider-default mode; GPT reasoning endpoints may
        // reject temperature or legacy max_tokens parameters.
        json!({"model":model,"messages":[{"role":"user","content":prompt}],"stream":false})
    };
    let client = Client::builder()
        .timeout(FINGERPRINT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "创建上游连接失败")?;
    let mut response = client
        .post(url)
        .bearer_auth(api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("上游连接失败: {}", e.without_url()))?;
    let status = response.status();
    if !status.is_success() {
        let raw = pelican_read_error_body(response)
            .await?
            .replace(api_key.trim(), "[redacted]");
        let detail = extract_upstream_error_message(&raw).unwrap_or_else(|| status.to_string());
        return Err(format!(
            "HTTP {}: {}",
            status.as_u16(),
            truncate_diagnostic_text(&detail, 1200)
        ));
    }
    let is_sse = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/event-stream"));
    if is_sse && wire_api == "responses" {
        let output = pelican_consume_response(response, PELICAN_IDLE_TIMEOUT, &|_| {}).await?;
        return Ok(FingerprintProbe {
            reply: output.reply,
            response_model: output.response_model,
            response_id: output.response_id,
        });
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取指纹响应失败")? {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("指纹响应超过 2 MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let parsed: Value = serde_json::from_slice(&bytes).map_err(|_| "上游返回了无效 JSON")?;
    fingerprint_parse_json(&parsed, wire_api)
}

fn fingerprint_parse_json(parsed: &Value, wire_api: &str) -> Result<FingerprintProbe, String> {
    if parsed
        .get("status")
        .and_then(Value::as_str)
        .is_some_and(|s| s != "completed")
    {
        return Err("上游响应未完整生成".into());
    }
    let reply = if wire_api == "responses" {
        pelican_final_text(parsed)
    } else {
        let choice = parsed.pointer("/choices/0").ok_or("上游没有返回 choices")?;
        if choice
            .get("finish_reason")
            .and_then(Value::as_str)
            .is_some_and(|r| r != "stop")
        {
            return Err("上游回答被截断或未正常结束".into());
        }
        choice
            .pointer("/message/content")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    if reply.trim().is_empty() {
        return Err("上游未返回可分析文本".into());
    }
    Ok(FingerprintProbe {
        reply,
        response_model: parsed
            .get("model")
            .and_then(Value::as_str)
            .map(str::to_owned),
        response_id: parsed.get("id").and_then(Value::as_str).map(str::to_owned),
    })
}

#[cfg(test)]
mod fingerprint_transport_tests {
    use super::*;
    #[test]
    fn fingerprint_oauth_samples_have_independent_sessions() {
        let (bytes, first) = fingerprint_oauth_request("gpt-6-sol", "numbers", "account").unwrap();
        let (_, second) = fingerprint_oauth_request("gpt-6-sol", "numbers", "account").unwrap();
        assert_ne!(first["session-id"], second["session-id"]);
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["model"], "gpt-6-sol");
        assert_eq!(body["instructions"], "");
        assert!(body.get("tools").is_none());
    }
    #[test]
    fn fingerprint_urls_and_payload_preserve_requested_model() {
        assert_eq!(
            fingerprint_endpoint("https://example.com", "responses")
                .unwrap()
                .as_str(),
            "https://example.com/v1/responses"
        );
        assert_eq!(
            fingerprint_endpoint("https://example.com/v1/responses", "chat_completions")
                .unwrap()
                .as_str(),
            "https://example.com/v1/chat/completions"
        );
        assert!(fingerprint_endpoint("file:///tmp/example", "responses").is_err());
        let body = fingerprint_response_body("gpt-6-sol", "numbers");
        assert_eq!(body["model"], "gpt-6-sol");
        assert_eq!(body["instructions"], "");
        assert!(body.get("tools").is_none());
    }
    #[test]
    fn fingerprint_rejects_truncated_completion() {
        let value = json!({"choices":[{"message":{"content":"1 2 3"},"finish_reason":"length"}]});
        assert!(fingerprint_parse_json(&value, "chat_completions").is_err());
        let value = json!({"model":"reported","choices":[{"message":{"content":"1 2 3"},"finish_reason":"stop"}]});
        assert_eq!(
            fingerprint_parse_json(&value, "chat_completions")
                .unwrap()
                .reply,
            "1 2 3"
        );
    }
}
