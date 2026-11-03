{ lib, nodejs_24 }:
let
  version = lib.strings.trim (builtins.readFile ../app/.node-version);
in
assert lib.assertMsg (
  nodejs_24.version == version
) "Update app/.node-version together with the pinned nixpkgs Node version.";
# Use nixpkgs' native build: rewriting the official ELF with autoPatchelf can
# corrupt Node on Linux. nixpkgs provides cached builds for our CI platforms.
nodejs_24
