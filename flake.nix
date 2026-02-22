{
  # This example flake.nix is pretty generic and the same for all
  # examples, except when they define devShells or extra packages.
  description = "ACARS Hub Dev Flake";

  # We import the latest commit of dream2nix main branch and instruct nix to
  # reuse the nixpkgs revision referenced by dream2nix.
  # This is what we test in CI with, but you can generally refer to any
  # recent nixpkgs commit here.
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    precommit-base = {
      url = "github:FredSystems/pre-commit-checks";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    playwright.url = "github:pietdevries94/playwright-web-flake";

    npm-chck.url = "github:FredSystems/npm-chck";
  };

  outputs =
    {
      self,
      precommit-base,
      nixpkgs,
      playwright,
      npm-chck,
    }:
    let
      # A helper that helps us define the attributes below for
      # all systems we care about.
      eachSystem = nixpkgs.lib.genAttrs [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];
    in
    {
      checks = eachSystem (system: {
        pre-commit-check = precommit-base.lib.mkCheck {
          inherit system;

          src = ./.;

          check_javascript = true;
          check_python = false;

          javascript = {
            enableBiome = true;
            enableTsc = true;
            tsConfig = "./tsconfig.json";
          };

          extraExcludes = [
            "secrets.yaml"
            "Logo-Sources"
            ".*.mp3"
            ".*.db"
            ".*.rrd"
            "spritesheet.json"
          ];
        };
      });

      devShells = eachSystem (
        system:
        let
          overlay = _final: prev: {
            inherit (playwright.packages.${system}) playwright-test playwright-driver;

            python313Packages = prev.python313Packages.override {
              overrides = _pyFinal: pyPrev: {
                alembic = pyPrev.alembic.overridePythonAttrs (_old: rec {
                  version = "1.18.2";
                  src = prev.fetchPypi {
                    pname = "alembic";
                    inherit version;
                    hash = "sha256-HD3bY18m77yAsbkMVlJUggICLU52D2p41thZWSgONoQ=";
                  };
                });
              };
            };
          };

          pkgs = import nixpkgs {
            inherit system;
            overlays = [ overlay ];
          };

          inherit (self.checks.${system}.pre-commit-check) shellHook enabledPackages;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.rrdtool
              npm-chck.packages.${system}.default
              pkgs.nodejs
              pkgs.just
              pkgs.playwright-test
              pkgs.sqlite
            ];

            buildInputs =
              enabledPackages
              ++ (with pkgs; [
                nodejs
                nodePackages.typescript
              ]);

            shellHook = ''
              export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
              export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
              ${shellHook}
            '';
          };
        }
      );
    };
}
