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
            "ground-stations.json"
            "metadata.json"
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

          # Docker CLI plugins provided by Nix — each lives at
          # $out/libexec/docker/cli-plugins/<name> and must be symlinked into
          # ~/.docker/cli-plugins/ so `docker buildx` / `docker compose` work.
          dockerPlugins = [
            pkgs.docker-buildx
            pkgs.docker-compose
          ];

          # Shell fragment that symlinks every Nix-managed Docker CLI plugin
          # into the user's plugin directory. Idempotent (ln -sf).
          linkDockerPlugins = pkgs.lib.concatMapStringsSep "\n" (
            p:
            let
              pluginDir = "${p}/libexec/docker/cli-plugins";
            in
            ''
              for _plugin in "${pluginDir}"/*; do
                ln -sf "$_plugin" "$HOME/.docker/cli-plugins/$(basename "$_plugin")"
              done
            ''
          ) dockerPlugins;
        in
        {
          default = pkgs.mkShell {
            packages = [
              pkgs.rrdtool
              npm-chck.packages.${system}.default
              pkgs.nodejs
              pkgs.just
              pkgs.sqlite
              pkgs.cmake
              pkgs.pkg-config

              # ── Docker tooling ──────────────────────────────────────────────
              # The Docker *daemon* is managed separately (system service or
              # rootless Docker).  These packages provide the CLI and plugins at
              # a Nix-pinned version so the dev environment doesn't depend on
              # whatever Docker happens to be installed on the host.
              pkgs.docker # docker CLI + engine binary (29.x)
              pkgs.docker-buildx # buildx CLI plugin  (multi-arch builds)
              pkgs.docker-compose # compose CLI plugin (docker compose …)

              # ── QEMU user-space emulators ───────────────────────────────────
              # Provides qemu-aarch64 and friends for cross-arch work.
              # NOTE: ~140 MB download / ~1 GB unpacked — fetched once by Nix.
              # The actual binfmt_misc kernel registration (needed for Docker
              # arm64 builds) is done separately via `just setup-multiarch`
              # because it requires a privileged Docker container and is
              # volatile across reboots.  See `just persist-binfmt` to make it
              # survive reboots via /etc/binfmt.d/.
              pkgs.qemu
            ];

            buildInputs =
              enabledPackages
              ++ (with pkgs; [
                nodejs
                nodePackages.typescript
              ]);

            shellHook = ''
              ${shellHook}

              # ── Docker CLI plugins ────────────────────────────────────────
              # Symlink Nix-managed buildx and compose into ~/.docker/cli-plugins/
              # so `docker buildx` and `docker compose` resolve to the pinned
              # Nix versions rather than any system-installed plugins.
              mkdir -p "$HOME/.docker/cli-plugins"
              ${linkDockerPlugins}

              # ── arm64 / QEMU binfmt status ────────────────────────────────
              # binfmt_misc registration is volatile (cleared on reboot).
              # Remind the user if it is not currently active.
              if [ ! -f /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then
                echo "ℹ️  arm64 binfmt not registered — cross-arch Docker builds will not work."
                echo "   Run:  just setup-multiarch"
                echo "   Then: just persist-binfmt   (makes it survive reboots)"
              fi
            '';
          };
        }
      );
    };
}
