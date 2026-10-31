// Универсальная обрезка фотографий для аватаров и обложек.
const IMAGE_CROP_TARGETS = {
  'profile-avatar': { title: 'Аватар профиля', ratio: 1, width: 512, height: 512, kind: 'avatar' },
  'profile-cover': { title: 'Обложка профиля', ratio: 16 / 5, width: 1600, height: 500, kind: 'cover' },
  'community-avatar': { title: 'Значок сообщества', ratio: 1, width: 512, height: 512, kind: 'avatar' },
  'community-cover': { title: 'Обложка сообщества', ratio: 16 / 5, width: 1600, height: 500, kind: 'cover' }
};
let imageCropTarget = null;
let imageCropObjectUrl = null;
let imageCropSource = null;
let imageCropState = null;
let imageCropPointer = null;

function startImageUpload(target) {
  if (!IMAGE_CROP_TARGETS[target]) return;
  if ((target === 'profile-avatar' || target === 'profile-cover') && typeof viewingProfile !== 'undefined' && viewingProfile && viewingProfile.id !== activeUserId()) {
    showToast('Можно менять изображения только в своём профиле', 'error');
    return;
  }
  if ((target === 'community-avatar' || target === 'community-cover') && !activeCommunityId) {
    showToast('Сначала откройте сообщество', 'error');
    return;
  }
  imageCropTarget = target;
  const input = document.getElementById('imageUploadInput');
  if (input) { input.value = ''; input.click(); }
}

function handleImageUpload(files) {
  const file = files && files[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type || '')) {
    showToast('Поддерживаются изображения PNG, JPG, WEBP и GIF', 'error');
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast('Исходное изображение должно быть не больше 10 МБ', 'error');
    return;
  }
  const spec = IMAGE_CROP_TARGETS[imageCropTarget];
  if (!spec) return;
  const stage = document.getElementById('imageCropStage');
  const image = document.getElementById('imageCropImage');
  if (!stage || !image) return;
  closeImageCropModal();
  imageCropSource = file;
  imageCropObjectUrl = URL.createObjectURL(file);
  stage.style.aspectRatio = String(spec.ratio);
  document.getElementById('imageCropTitle').textContent = 'Обрезать: ' + spec.title.toLowerCase();
  document.getElementById('imageCropZoom').value = '1';
  openModal('imageCropModal');
  image.onload = () => {
    imageCropSource = image;
    requestAnimationFrame(resetImageCropState);
  };
  image.onerror = () => {
    showToast('Не удалось открыть это изображение', 'error');
    closeImageCropModal();
  };
  image.src = imageCropObjectUrl;
}

function resetImageCropState() {
  const stage = document.getElementById('imageCropStage');
  if (!stage || !imageCropSource || !imageCropSource.naturalWidth) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;
  const baseScale = Math.max(width / imageCropSource.naturalWidth, height / imageCropSource.naturalHeight);
  imageCropState = { width, height, baseScale, zoom: 1, offsetX: 0, offsetY: 0 };
  updateImageCropTransform();
}

function clampImageCropOffsets() {
  if (!imageCropState || !imageCropSource) return;
  const s = imageCropState;
  const drawW = imageCropSource.naturalWidth * s.baseScale * s.zoom;
  const drawH = imageCropSource.naturalHeight * s.baseScale * s.zoom;
  const centeredLeft = (s.width - drawW) / 2;
  const centeredTop = (s.height - drawH) / 2;
  s.offsetX = Math.max(s.width - drawW - centeredLeft, Math.min(-centeredLeft, s.offsetX));
  s.offsetY = Math.max(s.height - drawH - centeredTop, Math.min(-centeredTop, s.offsetY));
}

function updateImageCropTransform() {
  if (!imageCropState || !imageCropSource) return;
  clampImageCropOffsets();
  const image = document.getElementById('imageCropImage');
  const s = imageCropState;
  const drawW = imageCropSource.naturalWidth * s.baseScale * s.zoom;
  const drawH = imageCropSource.naturalHeight * s.baseScale * s.zoom;
  image.style.width = drawW + 'px';
  image.style.height = drawH + 'px';
  image.style.left = ((s.width - drawW) / 2 + s.offsetX) + 'px';
  image.style.top = ((s.height - drawH) / 2 + s.offsetY) + 'px';
}

function setImageCropZoom(value) {
  if (!imageCropState) return;
  imageCropState.zoom = Math.max(1, Math.min(4, Number(value) || 1));
  updateImageCropTransform();
}

function imageCropPointerDown(event) {
  if (!imageCropState || event.button > 0) return;
  event.preventDefault();
  const stage = document.getElementById('imageCropStage');
  imageCropPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  stage.setPointerCapture(event.pointerId);
}
function imageCropPointerMove(event) {
  if (!imageCropPointer || imageCropPointer.id !== event.pointerId || !imageCropState) return;
  const dx = event.clientX - imageCropPointer.x;
  const dy = event.clientY - imageCropPointer.y;
  imageCropPointer.x = event.clientX;
  imageCropPointer.y = event.clientY;
  imageCropState.offsetX += dx;
  imageCropState.offsetY += dy;
  updateImageCropTransform();
}
function imageCropPointerUp(event) {
  if (imageCropPointer && imageCropPointer.id === event.pointerId) imageCropPointer = null;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось подготовить изображение')), type, quality);
  });
}
async function buildCroppedImage() {
  if (!imageCropSource || !imageCropState || !imageCropTarget) throw new Error('Нет изображения для обрезки');
  const spec = IMAGE_CROP_TARGETS[imageCropTarget];
  const s = imageCropState;
  const scale = s.baseScale * s.zoom;
  const drawW = imageCropSource.naturalWidth * scale;
  const drawH = imageCropSource.naturalHeight * scale;
  const left = (s.width - drawW) / 2 + s.offsetX;
  const top = (s.height - drawH) / 2 + s.offsetY;
  const sx = Math.max(0, -left / scale);
  const sy = Math.max(0, -top / scale);
  const sw = Math.min(imageCropSource.naturalWidth - sx, s.width / scale);
  const sh = Math.min(imageCropSource.naturalHeight - sy, s.height / scale);
  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Браузер не поддерживает обработку изображений');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageCropSource, sx, sy, sw, sh, 0, 0, spec.width, spec.height);
  let quality = 0.9;
  let blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  while (blob.size > 1900 * 1024 && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  if (blob.size > 2 * 1024 * 1024) throw new Error('Не удалось уменьшить изображение до 2 МБ');
  return new File([blob], spec.kind + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
}

async function applyImageCrop() {
  const button = document.getElementById('imageCropApply');
  if (button) button.disabled = true;
  try {
    const file = await buildCroppedImage();
    const target = imageCropTarget;
    closeImageCropModal();
    if (target === 'profile-avatar' || target === 'profile-cover') await saveCroppedProfileImage(target === 'profile-avatar' ? 'avatar' : 'cover', file);
    else await saveCroppedCommunityImage(target === 'community-avatar' ? 'avatar' : 'cover', file);
  } catch (error) {
    console.error('Не удалось применить обрезку:', error);
    showToast(error.message || 'Не удалось обработать изображение', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function saveCroppedProfileImage(kind, file) {
  const user = getCurrentUser();
  if (BACKEND) {
    if (!sb) { showToast('Подключение к Supabase ещё не готово', 'error'); return; }
    const result = await backendUploadProfileImage(kind, file);
    if (result.error) { console.error(result.error); showToast('Не удалось сохранить изображение: ' + (result.error.message || 'ошибка Supabase'), 'error'); return; }
    user[kind === 'avatar' ? 'avatar_url' : 'cover_url'] = result.url;
  } else {
    const dataUrl = await readImageFileAsDataUrl(file);
    user[kind] = dataUrl;
  }
  saveCurrentUser(user);
  updateProfile();
  showToast(kind === 'avatar' ? 'Аватар обновлён' : 'Обложка профиля обновлена', 'success');
}

async function saveCroppedCommunityImage(kind, file) {
  const community = allCommunitiesData.find(item => String(item.id) === String(activeCommunityId));
  if (!community) { showToast('Сообщество не найдено', 'error'); return; }
  let url;
  if (BACKEND) {
    if (!sb) { showToast('Подключение к Supabase ещё не готово', 'error'); return; }
    const result = await backendUploadCommunityImage(community.id, kind, file);
    if (result.error) { console.error(result.error); showToast('Не удалось сохранить изображение. Проверьте миграцию Supabase.', 'error'); return; }
    url = result.url;
  } else {
    url = await readImageFileAsDataUrl(file);
  }
  community[kind === 'avatar' ? 'avatar_url' : 'cover_url'] = url;
  if (!BACKEND) saveLocalCommunityAppearance(community);
  renderAllCommunities();
  openCommunity(community.id);
  showToast(kind === 'avatar' ? 'Значок сообщества обновлён' : 'Обложка сообщества обновлена', 'success');
}

function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    reader.readAsDataURL(file);
  });
}

function closeImageCropModal() {
  const modal = document.getElementById('imageCropModal');
  if (modal) modal.classList.remove('show');
  const image = document.getElementById('imageCropImage');
  if (image) { image.onload = null; image.onerror = null; image.removeAttribute('src'); image.style.cssText = ''; }
  if (imageCropObjectUrl) URL.revokeObjectURL(imageCropObjectUrl);
  imageCropObjectUrl = null;
  imageCropSource = null;
  imageCropState = null;
  imageCropPointer = null;
}

(function bindImageCropControls() {
  const input = document.getElementById('imageUploadInput');
  const stage = document.getElementById('imageCropStage');
  const zoom = document.getElementById('imageCropZoom');
  if (input) input.addEventListener('change', () => { handleImageUpload(input.files); input.value = ''; });
  if (stage) {
    stage.addEventListener('pointerdown', imageCropPointerDown);
    stage.addEventListener('pointermove', imageCropPointerMove);
    stage.addEventListener('pointerup', imageCropPointerUp);
    stage.addEventListener('pointercancel', imageCropPointerUp);
  }
  if (zoom) zoom.addEventListener('input', () => setImageCropZoom(zoom.value));
  window.addEventListener('resize', () => {
    if (document.getElementById('imageCropModal')?.classList.contains('show') && imageCropSource) resetImageCropState();
  });
})();
