{
  lib,
  stdenvNoCC,
  fetchurl,
  autoPatchelfHook,
  stdenv,
}:
let
  version = lib.strings.trim (builtins.readFile ../app/.node-version);
  # Official binaries avoid compiling Node in every CI shell. Update hashes
  # from the release's SHASUMS256.txt together with .node-version.
  platforms = {
    aarch64-darwin = {
      platform = "darwin-arm64";
      sha256 = "75ddfb875bbd868ebe57536f4442225f54dd10f6d2178dd439de869a5c648dc3";
    };
    aarch64-linux = {
      platform = "linux-arm64";
      sha256 = "fef00bb4d36e1c50104a9775a10359beee98f162b4104dd12472c75065c6a143";
    };
    x86_64-linux = {
      platform = "linux-x64";
      sha256 = "cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008";
    };
  };
  target = platforms.${stdenvNoCC.hostPlatform.system};
in
stdenvNoCC.mkDerivation {
  pname = "nodejs";
  inherit version;
  src = fetchurl {
    url = "https://nodejs.org/dist/v${version}/node-v${version}-${target.platform}.tar.xz";
    inherit (target) sha256;
  };
  nativeBuildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ stdenv.cc.cc.lib ];
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out"
    cp -r bin include lib share "$out/"
    runHook postInstall
  '';
  meta.mainProgram = "node";
}
