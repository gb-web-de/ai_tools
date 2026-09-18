<?php
declare(strict_types=1);

// Parse input as data. Never include/evaluate a file from the pull request.
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$results = [];
foreach ($input as $file) {
    $source = $file['content'];
    $lines = explode("\n", $source);
    try {
        $rawTokens = token_get_all($source, TOKEN_PARSE);
    } catch (ParseError $error) {
        $results[$file['filename']] = [['line' => $error->getLine(), 'type' => 'PHP_PARSE_ERROR', 'message' => 'PHP-Datei kann nicht geparst werden.']];
        continue;
    }
    $tokens = [];
    $offset = 0;
    $line = 1;
    foreach ($rawTokens as $token) {
        $text = is_array($token) ? $token[1] : $token;
        $id = is_array($token) ? $token[0] : null;
        if (!in_array($id, [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
            $tokens[] = ['id' => $id, 'text' => $text, 'offset' => $offset, 'line' => $line];
        }
        $offset += strlen($text);
        $line += substr_count($text, "\n");
    }
    $findings = [];
    $edits = [];
    foreach ($tokens as $index => $token) {
        if ($token['id'] !== T_NAME_FULLY_QUALIFIED || strtolower($token['text']) !== '\unserialize'
            || ($tokens[$index + 1]['text'] ?? '') !== '(') {
            continue;
        }
        // Only a single positional variable is an automatic review candidate.
        $argument = $tokens[$index + 2] ?? [];
        $close = $tokens[$index + 3] ?? [];
        if (($argument['id'] ?? null) !== T_VARIABLE || ($close['text'] ?? '') !== ')') {
            continue;
        }
        $lineNumber = $token['line'];
        $finding = ['line' => $lineNumber, 'type' => 'DESERIALIZATION', 'message' => 'Objekt-Erzeugung beim Deserialisieren ist nicht eingeschränkt. JSON bevorzugen; vorgeschlagene Einschränkung fachlich prüfen.'];
        if ($close['line'] === $lineNumber) {
            // Compute byte offset relative to the source line (PHP strings are byte-based).
            $lineStart = $lineNumber === 1 ? 0 : strrpos(substr($source, 0, $token['offset']), "\n") + 1;
            $edits[$lineNumber][] = ['position' => $close['offset'] - $lineStart, 'text' => ", ['allowed_classes' => false]"];
        }
        $findings[$lineNumber] = $finding;
    }
    foreach ($edits as $lineNumber => $lineEdits) {
        usort($lineEdits, static fn (array $left, array $right): int => $right['position'] <=> $left['position']);
        $replacement = $lines[$lineNumber - 1];
        foreach ($lineEdits as $edit) {
            $replacement = substr_replace($replacement, $edit['text'], $edit['position'], 0);
        }
        $findings[$lineNumber]['replacement'] = $replacement;
    }
    $results[$file['filename']] = array_values($findings);
}
fwrite(STDOUT, json_encode($results, JSON_THROW_ON_ERROR));
