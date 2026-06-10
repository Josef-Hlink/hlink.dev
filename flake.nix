{
  description = "hlink.dev - floating macOS + tmux terminal landing page (static SPA)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      # The built static site. `nix build` -> ./result is the dist/ you serve.
      packages = forAllSystems (pkgs: rec {
        hlink = pkgs.buildNpmPackage {
          pname = "hlink-dev";
          version = "0.2.0";
          src = ./.;

          # Refresh after package-lock.json changes:
          #   nix run nixpkgs#prefetch-npm-deps -- package-lock.json
          npmDepsHash = "sha256-fskBiAsGQFZOt9/ex7JEQDKeUKl4WexmfWP/ec03mfU=";

          nodejs = pkgs.nodejs_24;

          # `npm run build` is vue-tsc --noEmit && vite build -> dist/.
          # Static files only, so drop the default node_modules install layout
          # and just publish dist.
          installPhase = ''
            runHook preInstall
            cp -r dist $out
            runHook postInstall
          '';

          meta = {
            description = "Static landing page for hlink.dev";
            homepage = "https://hlink.dev";
          };
        };
        default = hlink;
      });

      # `nix run` serves the built site on http://localhost:8080 for a quick
      # local check. Not the production server (you terminate TLS / serve
      # dist from your host config).
      apps = forAllSystems (pkgs: rec {
        serve = {
          type = "app";
          program = "${pkgs.writeShellScript "hlink-serve" ''
            exec ${pkgs.python3}/bin/python3 -m http.server 8080 \
              --directory ${self.packages.${pkgs.system}.hlink}
          ''}";
        };
        default = serve;
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            pkgs.prefetch-npm-deps
          ];
        };
      });

      # The contact-form mailer behind hlink.dev/api/contact. The static site is
      # still a package-only output (above); this module is opt-in and only the
      # host that serves the site (esther) enables it. The server is a single
      # zero-dependency .mjs run by node — no build, no deps, no hash.
      nixosModules.default =
        { config, lib, pkgs, ... }:
        let
          cfg = config.services.hlink-contact;
          runner = pkgs.writeShellScriptBin "hlink-contact" ''
            exec ${pkgs.nodejs_24}/bin/node ${./server/contact.mjs}
          '';
        in
        {
          options.services.hlink-contact = {
            enable = lib.mkEnableOption "hlink.dev contact-form mailer";
            port = lib.mkOption {
              type = lib.types.port;
              default = 8788;
              description = "Loopback port the mailer listens on (Caddy proxies /api here).";
            };
            smtpHost = lib.mkOption {
              type = lib.types.str;
              default = "smtp.mailbox.org";
              description = "SMTP submission host.";
            };
            smtpPort = lib.mkOption {
              type = lib.types.port;
              default = 465;
              description = "SMTP submission port (implicit TLS).";
            };
            smtpUser = lib.mkOption {
              type = lib.types.str;
              description = "SMTP login — the full mailbox address.";
            };
            fromAddress = lib.mkOption {
              type = lib.types.str;
              default = "contact@hlink.dev";
              description = "From: address (must be an identity the account may send as).";
            };
            toAddress = lib.mkOption {
              type = lib.types.str;
              description = "Where notifications are delivered.";
            };
            replyFromAddress = lib.mkOption {
              type = lib.types.str;
              default = "josef@hlink.dev";
              description = "From: for the visitor auto-reply (must be an identity the account owns). Empty disables the auto-reply.";
            };
            passwordFile = lib.mkOption {
              type = lib.types.path;
              description = "File holding the SMTP password — kept out of the store (root:root 0600).";
            };
          };

          config = lib.mkIf cfg.enable {
            systemd.services.hlink-contact = {
              description = "hlink.dev contact-form mailer";
              wantedBy = [ "multi-user.target" ];
              after = [ "network-online.target" ];
              wants = [ "network-online.target" ];
              environment = {
                PORT = toString cfg.port;
                SMTP_HOST = cfg.smtpHost;
                SMTP_PORT = toString cfg.smtpPort;
                SMTP_USER = cfg.smtpUser;
                MAIL_FROM = cfg.fromAddress;
                MAIL_TO = cfg.toAddress;
                AUTOREPLY_FROM = cfg.replyFromAddress;
                SMTP_PASS_FILE = "%d/smtp-pass";
              };
              serviceConfig = {
                ExecStart = "${runner}/bin/hlink-contact";
                DynamicUser = true;
                LoadCredential = "smtp-pass:${cfg.passwordFile}";
                Restart = "on-failure";
                RestartSec = 5;
                # the service only opens an outbound socket and reads one cred
                NoNewPrivileges = true;
                ProtectSystem = "strict";
                ProtectHome = true;
                PrivateTmp = true;
              };
            };
          };
        };

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
