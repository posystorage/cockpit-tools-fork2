// apikey.fan 官方域名与旧域名兼容映射。

pub const APIKEY_FUN_PROVIDER_BASE_URL: &str = "";
pub const APIKEY_FUN_LEGACY_PROVIDER_BASE_URL: &str = "https://api.apikey.fun/v1";

// Preserve user-configured provider addresses; the fork has no sponsored default.
pub fn normalize_legacy_apikey_fun_url(_raw: &str) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::normalize_legacy_apikey_fun_url;

    #[test]
    fn never_rewrites_user_configured_provider_hosts() {
        for url in [
            "https://api.apikey.fun/v1",
            "https://api.apikey.fan/v1",
            "https://relay.example.com/v1",
        ] {
            assert_eq!(normalize_legacy_apikey_fun_url(url), None);
        }
    }
}
