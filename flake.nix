{
  description = "Typign development and purpose-specific CI tools";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
    in
    {
      devShells = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfreePredicate = pkg: nixpkgs.lib.getName pkg == "terraform";
          };
          terraform = pkgs.callPackage ./nix/terraform.nix { };
          nodejs = pkgs.callPackage ./nix/nodejs.nix { };
          actions-lock = pkgs.callPackage ./nix/actions-lock.nix { };
          pnpm = pkgs.pnpm_11.override {
            nodejs-slim = nodejs;
            version = "11.11.0";
            hash = "sha256-he8u/yFqGukIBMAMjfv6ZoU1NkRlDRCQaok8Ba7c2IQ=";
          };
          web = [
            nodejs
            pnpm
            pkgs.biome
          ];
          shell-tools = with pkgs; [
            coreutils
            gnugrep
            gnused
            gawk
            jq
            curl
            zip
            dash
          ];
          infra = with pkgs; [
            tflint
            trivy
          ];
          security = with pkgs; [
            gitleaks
            gitMinimal
          ];
          workflows = with pkgs; [
            actionlint
            shellcheck
            shfmt
            nixfmt
            statix
            gh
            actions-lock
          ];
          deploy = with pkgs; [
            awscli2
            coreutils
            curl
            gh
            gnupg
            gnugrep
            jq
            unzip
          ];
          shell = packages: pkgs.mkShellNoCC { inherit packages; };
        in
        {
          # Local direnv provides Terraform; CI installs it via setup-terraform.
          default = shell (web ++ shell-tools ++ infra ++ security ++ workflows ++ deploy ++ [ terraform ]);
          ci-web = shell (web ++ shell-tools);
          ci-infra = shell (
            infra
            ++ [
              pkgs.coreutils
              pkgs.gnugrep
              pkgs.gawk
              pkgs.dash
              pkgs.jq
              pkgs.gnupg
            ]
          );
          ci-security = shell security;
          ci-workflows = shell workflows;
          ci-deploy = shell deploy;
        }
      );
    };
}
