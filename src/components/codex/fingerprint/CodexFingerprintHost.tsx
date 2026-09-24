import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Fingerprint, Minus, RefreshCw, Square, X } from 'lucide-react';
import { useCodexAccountStore } from '../../../stores/useCodexAccountStore';
import { useCodexFingerprintStore } from '../../../stores/useCodexFingerprintStore';
import { listCodexModelProviders, type CodexModelProvider } from '../../../services/codexModelProviderService';
import { buildFingerprintTargets } from '../../../utils/codexFingerprint';
import { FINGERPRINT_MAX_CONCURRENCY, FINGERPRINT_MODELS } from '../../../types/codexFingerprint';
import { isPrivacyModeEnabledByDefault, maskSensitiveValue, PRIVACY_MODE_CHANGED_EVENT } from '../../../utils/privacy';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import '../pelican/pelican.css';
import './fingerprint.css';

const statusLabels = { queued: '排队中', running: '测试中', completed: '完成', partial: '部分完成', failed: '失败', cancelled: '已取消' };
export function CodexFingerprintHost() {
  const state = useCodexFingerprintStore();
  const accounts = useCodexAccountStore((value) => value.accounts);
  const [providers, setProviders] = useState<CodexModelProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [privacy, setPrivacy] = useState(isPrivacyModeEnabledByDefault);
  const [concurrency, setConcurrency] = useState(String(state.preferences.concurrency));
  const heading = useRef<HTMLHeadingElement>(null);
  useModalScrollLock(state.visible);
  useEffect(() => {
    const sync = () => setPrivacy(isPrivacyModeEnabledByDefault());
    window.addEventListener(PRIVACY_MODE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(PRIVACY_MODE_CHANGED_EVENT, sync);
  }, []);
  useEffect(() => {
    if (!state.visible) return;
    let disposed = false;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus();
    setLoading(true); setLoadError(null);
    void Promise.all([useCodexAccountStore.getState().fetchAccounts(), listCodexModelProviders()])
      .then(([, values]) => { if (!disposed) setProviders(values); })
      .catch((error) => { if (!disposed) setLoadError(String(error)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; previous?.focus(); };
  }, [state.visible, reload]);
  const targets = useMemo(() => buildFingerprintTargets(accounts, providers), [accounts, providers]);
  const filtered = targets.filter((target) => target.label.toLowerCase().includes(search.toLowerCase()));
  const selected = targets.filter((target) => state.preferences.targetIds.includes(target.id));
  const done = state.results.filter((item) => !['queued', 'running'].includes(item.status)).length;
  const concurrencyValue = Number(concurrency);
  const validConcurrency = concurrency.trim() !== '' && Number.isInteger(concurrencyValue) && concurrencyValue >= 1 && concurrencyValue <= FINGERPRINT_MAX_CONCURRENCY;
  const mask = (value: string) => maskSensitiveValue(value, privacy);
  const toggle = (field: 'models' | 'targetIds', value: string) => {
    const values = state.preferences[field];
    state.configure({ [field]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] });
  };
  if (!state.visible) return state.running ? createPortal(<button className="pelican-floating btn fingerprint-floating" onClick={state.open}>
    <Fingerprint size={18} />指纹测试 {done}/{state.results.length}
  </button>, document.body) : null;
  return createPortal(<div className="pelican-overlay"><section className="pelican-dialog fingerprint-dialog" role="dialog" aria-modal="true" aria-labelledby="fingerprint-title" onKeyDown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); state.close(); }
    if (event.key === 'Tab') {
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary');
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="pelican-header"><h2 id="fingerprint-title" ref={heading} tabIndex={-1}><Fingerprint size={22} />模型指纹测试</h2>
      <div className="pelican-actions"><button className="btn" title="最小化，测试继续" aria-label="最小化" onClick={state.close}><Minus size={18} /></button>
        <button className="btn" title="关闭面板，测试继续" aria-label="关闭" onClick={state.close}><X size={18} /></button></div></header>
    <div className="pelican-body">
      <p className="pelican-muted">基于 ModelTrace 数字输出统计，与内置的 16 模型参考库比较。结果是候选库内的相似性归因，不能作为模型身份的确定证明。</p>
      <form className="pelican-setup" onSubmit={(event) => { event.preventDefault(); if (validConcurrency) { state.configure({ concurrency: concurrencyValue }); void state.start(targets); } }}>
        <fieldset disabled={state.running} className="fingerprint-models"><legend>请求模型（可多选）</legend>
          {FINGERPRINT_MODELS.map((model) => <label key={model}><input type="checkbox" checked={state.preferences.models.includes(model)} onChange={() => toggle('models', model)} />{model}</label>)}
        </fieldset>
        <div className="fingerprint-settings">
          <label>最大并行数（1–{FINGERPRINT_MAX_CONCURRENCY}）<input type="number" min={1} max={FINGERPRINT_MAX_CONCURRENCY} step={1} disabled={state.running} value={concurrency} aria-invalid={!validConcurrency} onChange={(event) => { setConcurrency(event.target.value); const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= FINGERPRINT_MAX_CONCURRENCY) state.configure({ concurrency: value }); }} /></label>
          <label>每个账号 × 模型的指纹样本数<select disabled={state.running} value={state.preferences.samples} onChange={(event) => state.configure({ samples: Number(event.target.value) })}>
            {[1, 2, 3].map((count) => <option key={count} value={count}>{count} 个</option>)}</select></label>
        </div>
        <div className="pelican-section-heading"><strong>OAuth 账号 / 中转站 API 上游（已选 {selected.length}/{targets.length}）</strong>
          <div className="pelican-actions"><button className="btn" type="button" disabled={state.running || loading} onClick={() => setReload((value) => value + 1)}><RefreshCw size={14} />刷新</button>
            <button className="btn" type="button" disabled={state.running || !filtered.length} onClick={() => {
              const all = filtered.every((target) => state.preferences.targetIds.includes(target.id));
              state.configure({ targetIds: all ? state.preferences.targetIds.filter((id) => !filtered.some((target) => target.id === id)) : [...new Set([...state.preferences.targetIds, ...filtered.map((target) => target.id)])] });
            }}>全选 / 取消筛选结果</button></div></div>
        <input type="search" placeholder="搜索账号、上游或 Key 名称" aria-label="搜索测试目标" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="pelican-account-list">
          {loading && <p className="fingerprint-empty">加载账号与上游…</p>}
          {!loading && !filtered.length && <p className="fingerprint-empty">没有可选目标。请先添加 OAuth 账号或带 API Key 的模型供应商。</p>}
          {filtered.map((target) => <label className="pelican-account-choice" key={target.id}><input type="checkbox" disabled={state.running || loading} checked={state.preferences.targetIds.includes(target.id)} onChange={() => toggle('targetIds', target.id)} /><span>{mask(target.label)}</span><small>{target.kind === 'provider' ? target.wireApi : '账号'}</small></label>)}
        </div>
        <p className="pelican-muted">首次不勾选账号，开始测试后记忆本次账号。共 {selected.length * state.preferences.models.length} 组、最多 {selected.length * state.preferences.models.length * state.preferences.samples} 次请求；使用真实额度。错误不自动重试，不切换账号或请求模型。</p>
        {(state.error || loadError) && <p className="pelican-field-error" role="alert">{state.error || loadError}</p>}
        <div className="pelican-actions">{state.running ? <button type="button" className="btn btn-danger" disabled={state.cancelled} onClick={() => void state.cancel()}><Square size={14} />{state.cancelled ? '正在停止…' : '停止测试'}</button> : <button type="submit" className="btn btn-primary" disabled={loading || !!loadError || !validConcurrency || !selected.length || !state.preferences.models.length}>开始指纹测试</button>}</div>
      </form>
      {!!state.results.length && <section className="fingerprint-results"><h3 aria-live="polite">测试结果 · {done}/{state.results.length}</h3>
        <div className="fingerprint-table-wrap"><table><thead><tr><th>账号 / 上游</th><th>请求模型</th><th>状态 / 有效样本</th><th>最接近的参考模型</th><th>候选概率</th></tr></thead><tbody>
          {state.results.map((item) => <tr key={item.id}><td>{mask(item.targetLabel)}</td><td>{item.model}</td><td>{statusLabels[item.status]}<br />{item.analysis?.used_outputs || 0}/{item.requestedSamples}</td><td>{item.analysis?.prediction_name || '—'}
            <details><summary>详情</summary>
              {item.analysis && <><p>模型家族：{item.analysis.family_prediction_name}（{(item.analysis.family_probability * 100).toFixed(1)}%）</p>{item.analysis.results.slice(0, 3).map((candidate) => <p key={candidate.model}>{candidate.display_name}：{(candidate.probability * 100).toFixed(1)}%</p>)}</>}
              {item.error && <p className="pelican-field-error">{item.error}</p>}
              {item.samples.map((sample, index) => <details key={sample.challenge.id}><summary>样本 {index + 1}{sample.error ? ' · 失败' : ''}{sample.responseModel ? ' · 返回模型字段：' + sample.responseModel : ''}</summary><pre>{sample.error || sample.reply}</pre></details>)}
            </details></td><td>{item.analysis ? (item.analysis.probability * 100).toFixed(1) + '%' : '—'}</td></tr>)}
        </tbody></table></div></section>}
    </div>
  </section></div>, document.body);
}
