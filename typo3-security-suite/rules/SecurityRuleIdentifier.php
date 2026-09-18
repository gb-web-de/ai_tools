<?php

declare(strict_types=1);

namespace Security\TYPO3\Rules;

/**
 * Canonical PHPStan error identifiers for the TYPO3 security rule set.
 *
 * Identifiers are the stable contract between the rules, the advisory
 * regression tests and the SARIF exporter. Messages may be reworded at any
 * time; identifiers must not change without updating every consumer.
 */
final class SecurityRuleIdentifier
{
    public const SQL_INJECTION = 'typo3Security.sqlInjection';
    public const INSECURE_DESERIALIZATION = 'typo3Security.insecureDeserialization';
    public const BROKEN_ACCESS_CONTROL = 'typo3Security.brokenAccessControl';
    public const XSS_ECHO = 'typo3Security.xssEcho';
    public const XSS_VIEWHELPER_ESCAPING = 'typo3Security.xssViewHelperEscaping';
    public const DATA_LEAKAGE = 'typo3Security.dataLeakage';
    public const SSRF = 'typo3Security.ssrf';
    public const INSECURE_FILE_UPLOAD = 'typo3Security.insecureFileUpload';
    public const DIRECT_SUPERGLOBALS = 'typo3Security.directSuperglobals';

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return [
            self::SQL_INJECTION,
            self::INSECURE_DESERIALIZATION,
            self::BROKEN_ACCESS_CONTROL,
            self::XSS_ECHO,
            self::XSS_VIEWHELPER_ESCAPING,
            self::DATA_LEAKAGE,
            self::SSRF,
            self::INSECURE_FILE_UPLOAD,
            self::DIRECT_SUPERGLOBALS,
        ];
    }
}
