import { auditFiles, reviewComments, MAX_FILES, MAX_FILE_BYTES, safeFilePath } from './lib/security-review.js';

// Called by workflow_run from the trusted default branch. No artifact or PR script is executed.
export async function publishSecurityReview({ github, context, core }) {
  const { owner, repo } = context.repo;
  const runId = context.payload.workflow_run?.id;
  if (!Number.isSafeInteger(runId)) throw new Error('Workflow-Lauf fehlt.');
  const { data: run } = await github.rest.actions.getWorkflowRun({ owner, repo, run_id: runId });
  if (run.event !== 'pull_request' || run.path !== '.github/workflows/security-audit.yml'
    || run.repository.full_name !== `${owner}/${repo}` || !['success', 'failure'].includes(run.conclusion)) {
    core.info('Nicht passender Analyse-Lauf; kein Review.');
    return;
  }
  const candidates = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, { owner, repo, commit_sha: run.head_sha, per_page: 100 });
  for (const candidate of candidates) {
    const pull_number = candidate.number;
    const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
    if (pr.state !== 'open' || pr.base.repo.full_name !== `${owner}/${repo}` || pr.head.sha !== run.head_sha) continue;
    const marker = `<!-- typo3-security-review:v1:${pr.head.sha} -->`;
    const reviews = await github.paginate(github.rest.pulls.listReviews, { owner, repo, pull_number, per_page: 100 });
    if (reviews.some((review) => review.user?.type === 'Bot' && review.body?.includes(marker))) continue;

    const files = [];
    for (let page = 1; page <= Math.ceil(MAX_FILES / 100); page++) {
      const { data: entries } = await github.rest.pulls.listFiles({ owner, repo, pull_number, per_page: 100, page });
      for (const file of entries) {
        if (!safeFilePath(file.filename)) throw new Error('Unsicherer PR-Dateipfad.');
        const item = { filename: file.filename, status: file.status, patch: file.patch };
        if (file.status !== 'removed' && /\.(php|html)$/u.test(file.filename)
          && !/(^|\/)(vendor|node_modules|tests|Tests|templates\/rector)(\/|$)/u.test(file.filename)) {
          const { data: blob } = await github.rest.git.getBlob({ owner, repo, file_sha: file.sha });
          if (blob.encoding === 'base64' && blob.size <= MAX_FILE_BYTES) item.content = Buffer.from(blob.content, 'base64').toString('utf8');
        }
        files.push(item);
      }
      if (entries.length < 100) break;
    }
    const report = auditFiles(files);
    const comments = reviewComments(report);
    // Re-check immediately before posting: a push during analysis must not receive stale suggestions.
    const { data: current } = await github.rest.pulls.get({ owner, repo, pull_number });
    if (current.head.sha !== pr.head.sha || current.state !== 'open') { core.info('PR wurde aktualisiert; nächster Lauf übernimmt.'); continue; }
    if (!comments.length && report.complete) { core.info(`PR ${pull_number}: keine unterstützten Befunde in hinzugefügten Zeilen.`); continue; }
    const incomplete = report.complete ? '' : '\nAnalyse unvollständig: Dateien fehlen, sind zu groß oder enthalten Parsefehler. Details im Audit-Artefakt.';
    const capped = report.findings.length > comments.length ? `\nEs werden ${comments.length} von ${report.findings.length} Befunden als Inline-Kommentare angezeigt.` : '';
    await github.rest.pulls.createReview({
      owner, repo, pull_number, commit_id: pr.head.sha, event: 'COMMENT', comments,
      body: `${marker}\nTYPO3 Security: ${report.findings.length} prüfenswerte Befunde. Vorschläge vor Übernahme fachlich prüfen; sie sind keine Freigabe des gesamten PRs.${incomplete}${capped}`,
    });
  }
}
