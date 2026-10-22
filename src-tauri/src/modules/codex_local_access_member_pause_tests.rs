use super::*;

#[test]
fn fork_backup_resume_and_priority_change_preserve_authorization_pause() {
    let mut current = collection();
    let id = source().id;
    current.paused_account_ids = vec![id.clone()];
    assert!(set_backup_dispatch_enabled(&mut current, &id, false).unwrap());
    assert!(set_backup_dispatch_enabled(&mut current, &id, true).unwrap());
    assert_eq!(current.paused_account_ids, vec![id.clone()]);
    assert_eq!(current.account_model_rules[0].excluded_models, vec!["blocked-model"]);

    set_backup_dispatch_enabled(&mut current, &id, false).unwrap();
    apply_account_usage_priority_ids(&mut current, Some(&[]), None);
    assert_eq!(current.paused_account_ids, vec![id]);
    assert_eq!(current.account_model_rules[0].excluded_models, vec!["blocked-model"]);
}

#[test]
fn fork_authorization_resume_and_mode_switch_preserve_backup_pause() {
    let mut current = collection();
    let id = source().id;
    current.paused_account_ids = vec![id.clone()];
    set_backup_dispatch_enabled(&mut current, &id, false).unwrap();
    let official = switch(&current, true);
    assert!(official.paused_account_ids.is_empty());
    assert!(official.account_model_rules[0].excluded_models.contains(&"*".into()));
    let local = switch(&official, false);
    assert!(local.paused_account_ids.is_empty());
    assert_eq!(local.account_model_rules, current.account_model_rules);
    assert!(local.custom_routing_rules[0].is_backup);
}

#[test]
fn fork_legacy_member_remap_preserves_both_pause_causes_and_scopes() {
    let mut current = collection();
    let projection = projection();
    let source = source();
    switch_member_ids(&mut current.account_ids, &source.id, &projection.id);
    current.custom_routing_rules[0].account_id = projection.id.clone();
    current.account_model_rules[0].account_id = projection.id.clone();
    current.account_model_rules[0].excluded_models.push("*".into());
    current.api_keys[0].account_ids = vec![projection.id.clone()];
    current.api_keys[0].priority_account_ids = vec![projection.id.clone()];
    current.paused_account_ids = vec![projection.id.clone()];

    let remapped = switched_chatgpt_plan_collection_intent(
        &current, &source, Some(&projection), Some(&projection.id), false, true, true,
    ).unwrap();
    assert_eq!(remapped.paused_account_ids, vec![source.id.clone()]);
    assert_eq!(remapped.api_keys[0].account_ids, vec![source.id.clone()]);
    assert_eq!(remapped.account_model_rules[0].account_id, source.id);
    assert!(remapped.account_model_rules[0].excluded_models.contains(&"*".into()));

    let resumed = switched_chatgpt_plan_collection_intent(
        &remapped, &source, None, None, false, true, false,
    ).unwrap();
    assert!(resumed.paused_account_ids.is_empty());
    assert_eq!(resumed.account_model_rules, remapped.account_model_rules);
}

#[test]
fn member_pause_preserves_membership_and_scopes_when_source_credentials_are_incomplete() {
    let mut source = source();
    let mut current = collection();
    current.paused_account_ids = vec![source.id.clone()];
    source.tokens.access_token.clear();
    source.tokens.id_token.clear();
    source.tokens.refresh_token = None;
    let account = source.clone();
    sanitize_collection_with_accounts(&mut current, &[account]).unwrap();
    assert!(current.account_ids.contains(&source.id));
    assert_eq!(current.api_keys[0].account_ids, vec![source.id.clone()]);
    assert_eq!(current.custom_routing_rules[0].priority, 7);
    let members = service_member_snapshot(&current);
    assert!(members
        .iter()
        .any(|member| member.source_account_id == source.id && member.paused));
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("collection.json");
    save_collection_to_path(&path, &current).unwrap();
    let mut stale_ui = current.clone();
    stale_ui.paused_account_ids.clear();
    save_collection_to_path(&path, &stale_ui).unwrap();
    let reloaded = load_collection_from_path(&path).unwrap().unwrap();
    assert_eq!(reloaded.paused_account_ids, vec![source.id.clone()]);
    let mut removed = reloaded;
    remove_account_refs_from_collection(&mut removed, &HashSet::from([source.id.clone()]));
    save_collection_to_path(&path, &removed).unwrap();
    let reloaded = load_collection_from_path(&path).unwrap().unwrap();
    assert!(!reloaded.account_ids.contains(&source.id));
    assert!(!reloaded.paused_account_ids.contains(&source.id));
}

#[test]
fn member_switch_intent_and_pause_metadata_are_atomic_and_display_mapping_never_grants_access() {
    let original = collection();
    let official = switch(&original, true);
    let projection = projection();
    let paused = switched_chatgpt_plan_collection_intent(
        &official,
        &source(),
        Some(&projection),
        Some(&projection.id),
        false,
        true,
        true,
    )
    .unwrap();
    assert_eq!(paused.account_ids, original.account_ids);
    assert_eq!(paused.paused_account_ids, vec![source().id.clone()]);
    assert!(paused.official_account_bindings.is_empty());
    assert_eq!(
        paused.api_keys[0].account_ids,
        original.api_keys[0].account_ids
    );
    let resumed =
        switched_chatgpt_plan_collection_intent(&paused, &source(), None, None, false, true, false)
            .unwrap();
    assert!(resumed.paused_account_ids.is_empty());
    let mut removed = resumed.clone();
    removed.account_ids.clear();
    assert_eq!(
        switched_chatgpt_plan_collection_intent(
            &removed,
            &source(),
            None,
            None,
            false,
            true,
            false
        )
        .unwrap_err(),
        "CHATGPT_PLAN_SERVICE_MEMBER_REMOVED"
    );
    let mut orphan = official;
    orphan.account_ids = vec![projection.id.clone()];
    orphan.official_account_bindings.clear();
    orphan.official_account_source_ids.insert(projection.id.clone(), source().id);
    orphan.paused_account_ids = vec![projection.id.clone()];
    assert_eq!(
        switched_chatgpt_plan_collection_intent(&orphan, &source(), None, None, false, true, false)
            .unwrap_err(),
        "CHATGPT_PLAN_BINDING_REQUIRED"
    );
    assert_eq!(orphan.account_ids[0], projection.id);
}
