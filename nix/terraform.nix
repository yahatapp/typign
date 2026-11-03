{
  lib,
  stdenvNoCC,
  fetchurl,
  unzip,
}:
let
  version = lib.strings.trim (builtins.readFile ../infra/.terraform-version);
  # Official release checksums. Update with .terraform-version.
  targets = {
    aarch64-darwin = {
      platform = "darwin_arm64";
      sha256 = "b1ecb3fe0d0a0290c1ab6f83d967d43f25da05d0b671ee0fb355252268dce95a";
    };
    aarch64-linux = {
      platform = "linux_arm64";
      sha256 = "988e950a1c23058093b0e66ab2d5fb53fc18345ecfbd5871acf51dbac9325edd";
    };
    x86_64-linux = {
      platform = "linux_amd64";
      sha256 = "4638628058e71a55212b1c563712eac03b902128f40740f3dc8174df12135061";
    };
  };
  target = targets.${stdenvNoCC.hostPlatform.system};
in
stdenvNoCC.mkDerivation {
  pname = "terraform";
  inherit version;
  src = fetchurl {
    url = "https://releases.hashicorp.com/terraform/${version}/terraform_${version}_${target.platform}.zip";
    inherit (target) sha256;
  };
  nativeBuildInputs = [ unzip ];
  sourceRoot = ".";
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin" "$out/share/licenses/terraform"
    cp terraform "$out/bin/terraform"
    chmod +x "$out/bin/terraform"
    cp LICENSE.txt "$out/share/licenses/terraform/"
    runHook postInstall
  '';
  meta = {
    mainProgram = "terraform";
    license = lib.licenses.bsl11;
  };
}
