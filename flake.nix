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

    npm-chck.url = "github:FredSystems/npm-chck";
  };

  outputs =
    {
      self,
      precommit-base,
      nixpkgs,
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
            ".*.geojson"
            ".*.webp"
            "spritesheet.json"
          ];
        };
      });

      devShells = eachSystem (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
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
              pkgs.sqlite
            ];

            buildInputs =
              enabledPackages
              ++ (with pkgs; [
                nodejs
                nodePackages.typescript
              ]);

            shellHook = ''
              ${shellHook}
            '';
          };
        }
      );
    };
}
