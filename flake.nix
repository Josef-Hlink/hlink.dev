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
          version = "0.1.0";
          src = ./.;

          # Refresh after package-lock.json changes:
          #   nix run nixpkgs#prefetch-npm-deps -- package-lock.json
          npmDepsHash = "sha256-Ywsb6zQybwZO4IAJlFEqm+D/eW/oHFJ0QyxYldT2hNs=";

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

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
