/** Add Thalia's name without replacing the native version or ModLoader's marker. */
export function patchVersionDisplay(): void {
  const node = document.getElementById('gameVersionDisplay');
  if (!node || node.querySelector('[data-thalia-version]')) return;
  for (const child of node.childNodes) {
    if (child.nodeType !== 3) break;
    child.textContent = child.textContent?.trimStart() ?? '';
    if (child.textContent) break;
  }
  const marker = document.createElement('span');
  marker.dataset.thaliaVersion = '';
  marker.textContent = 'DoL-Thalia-';
  node.prepend(marker);
}

export function versionDisplayScript(): string {
  return `<script id="thalia-version-display">document.addEventListener('DOMContentLoaded', function () { const patch = ${patchVersionDisplay.toString()}; jQuery(document).on(':passageend.thalia-version', patch); patch(); });</script>`;
}
