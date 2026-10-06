/** Add Thalia's name without replacing the native version or ModLoader's marker. */
export function patchVersionDisplay(): void {
  const node = document.getElementById('gameVersionDisplay');
  if (!node || node.querySelector('[data-thalia-version]')) return;
  if (node.firstChild?.nodeType === 3) node.firstChild.textContent = node.firstChild.textContent?.trimStart() ?? '';
  const marker = document.createElement('span');
  marker.dataset.thaliaVersion = '';
  marker.textContent = 'DoL-Thalia-';
  node.prepend(marker);
}

export function versionDisplayScript(): string {
  return `<script id="thalia-version-display">document.addEventListener('DOMContentLoaded', function () { const patch = ${patchVersionDisplay.toString()}; jQuery(document).on(':passageend.thalia-version', patch); patch(); });</script>`;
}
