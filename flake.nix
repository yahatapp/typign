{
  description = "Typign development tools; language runtimes are managed externally";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfreePredicate = pkg: nixpkgs.lib.getName pkg == "terraform";
          };
        in
        {
          default = pkgs.mkShellNoCC {
            # Node.js, pnpm and Playwright stay under the existing runtime/package managers.
            packages = with pkgs; [ terraform awscli2 zip unzip curl ];
          };
        });
    };
}
