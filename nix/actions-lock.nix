{ stdenvNoCC, fetchurl }:
let
  targets = {
    aarch64-darwin = {
      name = "darwin-arm64";
      sha256 = "5934d40f8cc78ed3e9be15ba43fc82c2432cbf3aa088107f923878df07099bec";
    };
    aarch64-linux = {
      name = "linux-arm64";
      sha256 = "7de0e440274688b8ddcbb6f44ce686aaebbe17a54a3052ebc11d4bae9f641fa2";
    };
    x86_64-linux = {
      name = "linux-amd64";
      sha256 = "f9da98f2a6e9e0ae77deadf9a2319a8a86bb002b541cc3203b247cc59fb04842";
    };
  };
  target = targets.${stdenvNoCC.hostPlatform.system};
in
stdenvNoCC.mkDerivation {
  pname = "gh-actions-lock";
  version = "0.4.0";
  src = fetchurl {
    url = "https://github.com/github/gh-actions-lock/releases/download/v0.4.0/${target.name}";
    inherit (target) sha256;
  };
  dontUnpack = true;
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin"
    cp "$src" "$out/bin/gh-actions-lock"
    chmod +x "$out/bin/gh-actions-lock"
    runHook postInstall
  '';
  meta.mainProgram = "gh-actions-lock";
}
