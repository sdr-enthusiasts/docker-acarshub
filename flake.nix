{
  # This example flake.nix is pretty generic and the same for all
  # examples, except when they define devShells or extra packages.
  description = "ACARS Hub Dev Flake";

  # We import the latest commit of dream2nix main branch and instruct nix to
  # reuse the nixpkgs revision referenced by dream2nix.
  # This is what we test in CI with, but you can generally refer to any
  # recent nixpkgs commit here.
  inputs = {
    dream2nix.url = "github:nix-community/dream2nix";
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
      dream2nix,
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
      packages = eachSystem (
        system:
        dream2nix.lib.evalModules {
          packageSets.nixpkgs = nixpkgs.legacyPackages.${system};
          modules = [
            # Import our actual package definition as a dream2nix module from ./default.nix
            ./default.nix
            {
              # Aid dream2nix to find the project root. This setup should also works for mono
              # repos. If you only have a single project, the defaults should be good enough.
              paths = {
                projectRoot = ./.;
                # can be changed to ".git" or "flake.nix" to get rid of .project-root
                projectRootFile = "flake.nix";
                package = ./.;
              };
            }
          ];
        }
      );

      checks = eachSystem (system: {
        pre-commit-check = precommit-base.lib.mkCheck {
          inherit system;

          src = ./.;

          check_javascript = true;
          check_python = true;

          javascript = {
            enableBiome = true;
            enableTsc = true;
            tsConfig = "./tsconfig.json";
          };

          extraExcludes = [
            "secrets.yaml"
            "Logo-Sources"
            ".*.mp3"
          ];
        };
      });

      # packages = eachSystem (system: {
      #   # For each system, we define our default package
      #   # by passing in our desired nixpkgs revision plus
      #   # any dream2nix modules needed by it.
      #   dream2nix.lib.evalModules {
      #     packageSets.nixpkgs = nixpkgs.legacyPackages.${system};
      #     modules = [
      #       # Import our actual package definition as a dream2nix module from ./default.nix
      #       ./default.nix
      #       {
      #         # Aid dream2nix to find the project root. This setup should also works for mono
      #         # repos. If you only have a single project, the defaults should be good enough.
      #         paths.projectRoot = ./.;
      #         # can be changed to ".git" or "flake.nix" to get rid of .project-root
      #         paths.projectRootFile = "flake.nix";
      #         paths.package = ./.;
      #       }
      #     ];
      #   };
      # );
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
              pkgs.python313
              pkgs.python313Packages.alembic
              pkgs.pdm
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
