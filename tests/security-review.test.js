import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { addedLines, auditFiles, patchFor, reviewComments } from '../scripts/lib/security-review.js';
import { publishSecurityReview } from '../scripts/publish-security-review.js';

function file(filename, content) {
  const lines = content.replace(/\n$/u, '').split('\n');
  return { filename, content, patch: `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join('\n')}` };
}
const raw = '    {user.content -> f:format.raw()}';

test('proposals cover added lines only and avoid JavaScript/attribute contexts', () => {
  const report = auditFiles([file('Resources/Template.html', `<div>\n${raw}\n</div>\n`)]);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].replacement, '    {user.content}');
  assert.match(reviewComments(report)[0].body, /```suggestion\n    \{user.content\}\n```/u);
  const existing = file('Resources/Existing.html', `${raw}\n<p>Updated</p>\n`);
  existing.patch = '@@ -2 +2 @@\n-<p>Old</p>\n+<p>Updated</p>';
  assert.equal(auditFiles([existing]).findings.length, 0);
  for (const context of [`<script>\n${raw}\n</script>`, `<a title="\n${raw}\n">`, `<!--\n${raw}\n-->`, `<style>\n${raw}\n</style>`]) {
    const result = auditFiles([file('Resources/Context.html', context)]);
    assert.equal(result.findings[0].replacement, undefined);
  }
  assert.deepEqual([...addedLines('@@ -1,2 +3,2 @@\n context\n-old\n+new')], [[4, 'new']]);
});

test('PHP is tokenized without executing source, comments or strings', () => {
  const content = `<?php\ndeclare(strict_types=1);\nfile_put_contents('/never-execute-this-file', 'bad');\n// \\unserialize($comment);\n$text = '\\unserialize($string);';\n$a = \\unserialize($payload); $b = \\unserialize($other);\n$c = \\unserialize($payload, ['allowed_classes' => false]);\n`;
  const report = auditFiles([file('Classes/Decoder.php', content)]);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].line, 6);
  assert.equal(report.findings[0].replacement, "$a = \\unserialize($payload, ['allowed_classes' => false]); $b = \\unserialize($other, ['allowed_classes' => false]);");
  const broken = auditFiles([file('Classes/Broken.php', '<?php invalid( ;')]);
  assert.equal(broken.complete, false);
  assert.equal(broken.findings[0].type, 'PHP_PARSE_ERROR');
});

test('generated patch applies cleanly, including filenames with spaces and no trailing newline', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-patch-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const items = [file('Template example.html', `<div>\n${raw}\n</div>\n${raw}`), file('Decode.php', '<?php\ndeclare(strict_types=1);\n$a = \\unserialize($b);\n')];
  for (const item of items) fs.writeFileSync(path.join(dir, item.filename), item.content);
  const report = auditFiles(items);
  const result = spawnSync('git', ['apply', '--unidiff-zero', '-'], { cwd: dir, input: patchFor(report), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'Template example.html'), 'utf8'), '<div>\n    {user.content}\n</div>\n    {user.content}');
  const php = fs.readFileSync(path.join(dir, 'Decode.php'), 'utf8');
  assert.match(php, /allowed_classes/u);
  assert.equal(auditFiles([file('Decode.php', php)]).findings.length, 0);
});

test('unsupported, inconsistent and hostile input is reported or rejected', () => {
  assert.throws(() => auditFiles([file('../Template.html', raw)]), /Unsicherer/);
  const mismatch = file('Template.html', raw); mismatch.patch = '@@ -0,0 +1 @@\n+other';
  assert.throws(() => auditFiles([mismatch]), /passen nicht/);
  assert.equal(auditFiles([{ filename: 'Template.html' }]).complete, false);
  assert.equal(auditFiles([file('tests/fixtures/Vulnerable.html', raw)]).scanned_files, 0);
  assert.equal(auditFiles([file('typo3-security-suite/templates/rector/Rule.php', '<?php echo 1;')]).scanned_files, 0);
});

function mockedGitHub({ stale = false, duplicate = false, fork = false, event = 'pull_request', conclusion = 'success' } = {}) {
  const sha = 'a'.repeat(40);
  const source = file('Resources/Template.html', `${raw}\n`);
  const published = [];
  let reads = 0;
  const pr = { number: 7, state: 'open', head: { sha, repo: { full_name: fork ? 'fork/repo' : 'owner/repo' } }, base: { repo: { full_name: 'owner/repo' } } };
  const methods = {
    actions: { getWorkflowRun: async () => ({ data: { event, path: '.github/workflows/security-audit.yml', repository: { full_name: 'owner/repo' }, conclusion, head_sha: sha } }) },
    repos: { listPullRequestsAssociatedWithCommit: () => {} },
    pulls: {
      get: async () => ({ data: ++reads > 1 && stale ? { ...pr, head: { sha: 'b'.repeat(40) } } : pr }),
      listReviews: () => {},
      listFiles: async () => ({ data: [{ ...source, content: undefined, sha: 'c'.repeat(40) }] }),
      createReview: async (review) => { published.push(review); },
    },
    git: { getBlob: async () => ({ data: { encoding: 'base64', size: source.content.length, content: Buffer.from(source.content).toString('base64') } }) },
  };
  return {
    published,
    args: {
      context: { repo: { owner: 'owner', repo: 'repo' }, payload: { workflow_run: { id: 10 } } },
      core: { info: () => {} },
      github: { rest: methods, paginate: async (method) => method === methods.repos.listPullRequestsAssociatedWithCommit ? [pr]
        : duplicate ? [{ user: { type: 'Bot' }, body: `<!-- typo3-security-review:v1:${sha} -->` }] : [] },
    },
  };
}

test('publisher creates a commit-bound suggestion, including fork PRs, without artifacts', async () => {
  for (const fork of [false, true]) {
    const mock = mockedGitHub({ fork });
    await publishSecurityReview(mock.args);
    assert.equal(mock.published.length, 1);
    assert.equal(mock.published[0].commit_id, 'a'.repeat(40));
    assert.equal(mock.published[0].comments[0].line, 1);
    assert.match(mock.published[0].comments[0].body, /suggestion/u);
  }
});

test('publisher skips stale, duplicate, unrelated and cancelled runs', async () => {
  for (const options of [{ stale: true }, { duplicate: true }, { event: 'push' }, { conclusion: 'cancelled' }]) {
    const mock = mockedGitHub(options);
    await publishSecurityReview(mock.args);
    assert.equal(mock.published.length, 0);
  }
});

test('audit CLI reads committed source and emits an applicable patch without editing checkout', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typo3-pr-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'Template.html'), '<div>safe</div>\n');
  git('add', 'Template.html');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'Template.html'), `${raw}\n`);
  git('add', 'Template.html');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'head');
  const head = git('rev-parse', 'HEAD');
  const output = path.join(dir, 'review');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/security-audit-pr.js', import.meta.url)), '--base', base, '--head', head, '--output', output], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(fs.readFileSync(path.join(output, 'report.json')));
  assert.equal(report.findings.length, 1);
  assert.equal(report.head_sha, head);
  assert.equal(fs.readFileSync(path.join(dir, 'Template.html'), 'utf8'), `${raw}\n`);
  git('apply', '--check', '--unidiff-zero', path.join(output, 'security-fixes.patch'));
});
