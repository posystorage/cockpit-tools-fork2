use super::*;

fn logs() -> (tempfile::TempDir, Connection) {
    let dir = tempfile::tempdir().unwrap();
    let conn = open_local_access_logs_db_once(&dir.path().join("logs.sqlite"), true).unwrap();
    ensure_remote_analytics_schema(&conn).unwrap();
    (dir, conn)
}
fn write(id: &str, epoch: u64) -> UsageLogWrite {
    let event = CodexLocalAccessUsageEvent {
        timestamp: REMOTE_HOUR,
        request_id: id.into(),
        api_key_id: "writer-key".into(),
        requested_model: "public".into(),
        success: true,
        total_tokens: 12,
        budget_settlement: Some(
            crate::models::codex_local_access::CodexRequestBudgetSettlement {
                amount_microusd: 123,
                metered: true,
                settled_at: REMOTE_HOUR,
            },
        ),
        ..Default::default()
    };
    UsageLogWrite {
        bytes: usage_log_encoded_bytes(&event).unwrap(),
        event,
        epoch,
        official: None,
    }
}

fn finish_writes(conn: &Connection, batch: &[UsageLogWrite], epoch: u64) {
    let mut cursor = 0;
    let mut retries = 0;
    while cursor < batch.len() {
        let consumed = match write_usage_log_batch(conn, &batch[cursor..], epoch) {
            Ok(consumed) => consumed,
            Err(error) if error.to_lowercase().contains("interrupted") && retries < 8 => {
                retries += 1;
                continue;
            }
            Err(error) => panic!("batch failed: {error}"),
        };
        assert!(consumed > 0 && consumed <= batch.len() - cursor);
        cursor += consumed;
    }
}

#[test]
fn summary_transaction_rollback_never_commits_later_rows_outside_the_batch() {
    let (_dir, conn) = logs();
    crate::modules::codex_request_summary::ensure_schema(&conn).unwrap();
    conn.execute_batch("CREATE TRIGGER rollback_summary BEFORE INSERT ON request_display_summaries BEGIN SELECT RAISE(ROLLBACK,'interrupted summary'); END;").unwrap();
    let batch = vec![write("one", 1), write("two", 1)];
    assert!(write_usage_log_batch(&conn, &batch, 1).is_err());
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM request_logs", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    conn.execute_batch("DROP TRIGGER rollback_summary;")
        .unwrap();
    finish_writes(&conn, &batch, 1);
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM request_logs", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
    assert_eq!(
        conn.query_row("SELECT SUM(settled_microusd) FROM request_logs", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap(),
        246
    );
}

#[test]
fn settlement_and_raw_log_roll_back_together_and_retry_exactly_once() {
    let (_dir, conn) = logs();
    conn.execute_batch(
        "CREATE TRIGGER fail_charge BEFORE UPDATE OF settled_microusd ON request_logs
        BEGIN SELECT RAISE(ABORT,'storage failure'); END;",
    )
    .unwrap();
    let item = write("one", 1);
    assert!(insert_live_local_access_usage_event(&conn, &item.event).is_err());
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM request_logs", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        query_remote_key_stats(&conn, "writer-key", 0, 2 * REMOTE_HOUR).unwrap()["summary"]
            ["requestCount"],
        0
    );
    conn.execute_batch("DROP TRIGGER fail_charge;").unwrap();
    insert_live_local_access_usage_event(&conn, &item.event).unwrap();
    insert_live_local_access_usage_event(&conn, &item.event).unwrap();
    let stats = query_remote_key_stats(&conn, "writer-key", 0, 2 * REMOTE_HOUR).unwrap();
    assert_eq!(stats["summary"]["requestCount"], 1);
    assert_eq!(stats["summary"]["settledMicrousd"], 123);
}

#[test]
fn batch_failure_preserves_cursor_and_clear_epoch_does_not_resurrect_old_requests() {
    let (_dir, conn) = logs();
    conn.execute_batch(
        "CREATE TRIGGER fail_second BEFORE INSERT ON request_logs WHEN NEW.request_id='one'
        BEGIN SELECT RAISE(ABORT,'storage failure'); END;",
    )
    .unwrap();
    let batch = vec![write("one", 2), write("two", 2)];
    assert!(write_usage_log_batch(&conn, &batch, 2).is_err());
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM request_logs", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    conn.execute_batch("DROP TRIGGER fail_second;").unwrap();
    // A batch may yield after any row when its time budget expires. Continue
    // from the returned cursor, exactly as the production writer does.
    finish_writes(&conn, &batch, 2);
    finish_writes(&conn, &batch, 2);
    conn.execute("DELETE FROM request_logs", []).unwrap();
    finish_writes(&conn, &batch, 3);
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM request_logs", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        write_usage_log_batch(&conn, &[write("new", 3)], 3).unwrap(),
        1
    );
    let stats = query_remote_key_stats(&conn, "writer-key", 0, 2 * REMOTE_HOUR).unwrap();
    assert_eq!(stats["summary"]["requestCount"], 1);
    assert_eq!(stats["summary"]["settledMicrousd"], 123);
}

#[tokio::test]
async fn bounded_queue_applies_backpressure_without_starting_tasks_or_blocking_runtime() {
    let (sender, mut receiver) = tokio::sync::mpsc::channel(2);
    sender.try_send(write("one", 1)).unwrap();
    sender.try_send(write("two", 1)).unwrap();
    assert!(sender.try_send(write("three", 1)).is_err());
    let send = sender.send(write("three", 1));
    assert!(tokio::time::timeout(Duration::from_millis(10), send)
        .await
        .is_err());
    assert_eq!(receiver.recv().await.unwrap().event.request_id, "one");
    assert_eq!(receiver.recv().await.unwrap().event.request_id, "two");
    assert!(receiver.try_recv().is_err());
}

#[test]
fn one_oversized_record_has_a_byte_boundary_before_it_enters_the_queue() {
    let mut item = write("one", 1);
    item.event.error_message = "x".repeat(USAGE_WRITER_ROW_BYTES + 1);
    assert!(usage_log_encoded_bytes(&item.event).is_err());
    assert!(USAGE_WRITER_CAPACITY * USAGE_WRITER_ROW_BYTES <= 32 * 1024 * 1024);
    assert!(USAGE_WRITER_BATCH_BYTES <= 512 * 1024);
}

#[test]
fn fork_queued_identity_is_immutable_across_retries_and_newer_account_snapshots() {
    let (_dir, conn) = logs();
    let mut item = write("historical-identity", 1);
    item.event.account_id = "deleted-local-account".into();
    item.event.email = "original@example.invalid".into();
    item.official = Some("original-official-account".into());
    finish_writes(&conn, &[item], 1);
    let mut repeated = write("historical-identity", 1);
    repeated.event.account_id = "deleted-local-account".into();
    repeated.event.email = "original@example.invalid".into();
    repeated.official = Some("replacement-official-account".into());
    finish_writes(&conn, &[repeated], 1);
    let (official, email, count): (String, String, i64) = conn.query_row(
        "SELECT official_account_id, email, COUNT(*) FROM request_logs",
        [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).unwrap();
    assert_eq!(official, "original-official-account");
    assert_eq!(email, "original@example.invalid");
    assert_eq!(count, 1);

    let unknown = write("unknown-historical-identity", 1);
    finish_writes(&conn, &[unknown], 1);
    let mut repeated = write("unknown-historical-identity", 1);
    repeated.official = Some("later-imported-account".into());
    finish_writes(&conn, &[repeated], 1);
    let official: String = conn.query_row(
        "SELECT official_account_id FROM request_logs WHERE request_id='unknown-historical-identity'",
        [], |row| row.get(0),
    ).unwrap();
    assert!(official.is_empty(), "an originally unknown identity cannot be backfilled from today's account");
}

#[test]
fn fork_local_rejection_never_enters_usage_rollups_or_budget_settlements() {
    let (_dir, conn) = logs();
    let mut item = write("locally-rejected", 1);
    item.event.local_rejection = true;
    item.event.connection_source = Some(classify_request_peer(
        "127.0.0.1".parse().unwrap(), &Default::default()));
    item.event.success = false;
    item.event.http_status = Some(403);
    item.event.error_category = "model_excluded".into();
    finish_writes(&conn, &[item], 1);
    let raw: i64 = conn.query_row("SELECT COUNT(*) FROM request_logs", [], |row| row.get(0)).unwrap();
    let rejected: i64 = conn.query_row("SELECT COUNT(*) FROM request_log_rejections", [], |row| row.get(0)).unwrap();
    assert_eq!(raw, 0);
    assert_eq!(rejected, 1);
    let stats = query_remote_key_stats(&conn, "writer-key", 0, 2 * REMOTE_HOUR).unwrap();
    assert_eq!(stats["summary"]["requestCount"], 0);
    assert_eq!(stats["summary"]["settledMicrousd"], 0);
    assert_eq!(query_rollup_window(&conn, 0, 2 * REMOTE_HOUR).unwrap().totals.request_count, 0);
}

#[test]
fn slow_sql_batch_is_interrupted_and_same_rows_can_be_retried_without_partial_charge() {
    let (_dir, conn) = logs();
    conn.execute_batch("CREATE TRIGGER slow_usage BEFORE INSERT ON request_logs BEGIN
        SELECT SUM(x) FROM (WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000000) SELECT x FROM n);
        END;").unwrap();
    let rows = vec![write("slow", 1)];
    let started = Instant::now();
    let budget_expired = AtomicBool::new(false);
    assert!(write_usage_log_batch_limited(&conn, &rows, 1, 1, &budget_expired).is_err());
    assert!(budget_expired.load(Ordering::Relaxed));
    assert!(started.elapsed() < Duration::from_secs(1));
    assert_eq!(
        conn.query_row("SELECT COUNT(*) FROM request_logs", [], |r| r
            .get::<_, i64>(0))
            .unwrap(),
        0
    );
    conn.execute_batch("DROP TRIGGER slow_usage").unwrap();
    finish_writes(&conn, &rows, 1);
    assert_eq!(
        query_remote_key_stats(&conn, "writer-key", 0, 2 * REMOTE_HOUR).unwrap()["summary"]
            ["settledMicrousd"],
        123
    );
}
