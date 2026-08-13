CREATE TABLE source_credentials
(
    key_id         VARCHAR(40) NOT NULL,
    source_system  VARCHAR(64) NOT NULL,
    secret_mac     CHAR(64)    NOT NULL,
    pepper_version SMALLINT    NOT NULL,
    status         VARCHAR(20) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL,
    expires_at     TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,
    CONSTRAINT pk_source_credentials PRIMARY KEY (key_id),
    CONSTRAINT ck_source_credentials_key_id_format CHECK (key_id ~ '^[A-Za-z0-9_-]{16,40}$'),
    CONSTRAINT ck_source_credentials_source_system_not_blank CHECK (btrim(source_system) <> ''),
    CONSTRAINT ck_source_credentials_secret_mac_format CHECK (secret_mac ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_source_credentials_pepper_version_positive CHECK (pepper_version > 0),
    CONSTRAINT ck_source_credentials_status CHECK (status IN ('ACTIVE', 'REVOKED')),
    CONSTRAINT ck_source_credentials_revocation_state CHECK (
        (status = 'ACTIVE' AND revoked_at IS NULL)
        OR (status = 'REVOKED' AND revoked_at IS NOT NULL)
    ),
    CONSTRAINT ck_source_credentials_expiry_after_creation CHECK (
        expires_at IS NULL OR expires_at > created_at
    ),
    CONSTRAINT ck_source_credentials_revocation_after_creation CHECK (
        revoked_at IS NULL OR revoked_at >= created_at
    )
);

CREATE INDEX source_credentials_source_status_idx
    ON source_credentials (source_system, status);
