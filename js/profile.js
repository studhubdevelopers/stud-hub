// Профиль пользователя и его редактирование
function updateProfile() {
const user = (typeof viewingProfile !== 'undefined' && viewingProfile) ? viewingProfile : getCurrentUser();
const isOwnProfile = !(typeof viewingProfile !== 'undefined' && viewingProfile) || viewingProfile.id === activeUserId();
const initials = getInitials(user.name);
const ownUser = getCurrentUser();
const ownInitials = getInitials(ownUser.name);
const avatarUrl = user.avatar_url || user.avatar || '';
const ownAvatarUrl = ownUser.avatar_url || ownUser.avatar || '';
const paintAvatar = (el, url, text) => { if (!el) return; el.textContent = url ? '' : text; el.style.backgroundImage = url ? `url(\"${String(url).replace(/[\"\\]/g, '')}\")` : ''; el.style.backgroundSize = url ? 'cover' : ''; el.style.backgroundPosition = url ? 'center' : ''; el.style.backgroundRepeat = 'no-repeat'; };
document.getElementById('profileName').textContent = user.name || 'Студент';
const editSection = document.querySelector('.profile-edit-section'); if (editSection) editSection.style.display = isOwnProfile ? '' : 'none';
const coverEdit = document.querySelector('.cover-edit-btn'); if (coverEdit) coverEdit.style.display = isOwnProfile ? '' : 'none';
const avatarEdit = document.querySelector('.profile-avatar-edit'); if (avatarEdit) avatarEdit.style.display = isOwnProfile ? '' : 'none';
const profileCover = document.querySelector('.profile-cover');
if (profileCover) {
  const coverUrl = user.cover_url || user.cover || '';
  profileCover.style.backgroundImage = coverUrl ? `url("${String(coverUrl).replace(/["\\]/g, '')}")` : '';
  profileCover.classList.toggle('has-custom-cover', !!coverUrl);
  const demo = profileCover.querySelector('.cover-demo'); if (demo) demo.style.display = coverUrl ? 'none' : '';
}
const profileAvatar = document.getElementById('profileAvatarLarge');
const headerAvatar = document.getElementById('userAvatarHeader');
paintAvatar(profileAvatar, avatarUrl, initials);
paintAvatar(headerAvatar, ownAvatarUrl, ownInitials);
document.getElementById('userNameHeader').textContent = ownUser.name;
document.querySelectorAll('.composer-avatar').forEach(el => paintAvatar(el, ownAvatarUrl, ownInitials));
if (document.getElementById('profileSubtitle')) document.getElementById('profileSubtitle').textContent = [user.subtitle, user.city].filter(Boolean).join(' · ') || (isOwnProfile ? 'Добавьте информацию о себе в настройках профиля' : 'Пользователь StudHub');
const acc = isOwnProfile ? getActiveAccount() : null;
const isDemoProfile = !acc || user.username === 'dimidrol'; // демо-цифры (подписчики, отзывы) только у перенесённого демо-профиля
const emptyBio = 'Расскажите о себе: нажмите «Редактировать профиль».';
if (document.getElementById('profileAboutText')) document.getElementById('profileAboutText').textContent = user.bio || (isDemoProfile ? document.getElementById('profileAboutText').textContent : emptyBio);
if (!isDemoProfile || !isOwnProfile) { // у нового аккаунта пока нет подписчиков и отзывов
  [['statFollowers', 0], ['statFollowing', 0], ['statReviews', 0]].forEach(([id, v]) => { const el = document.getElementById(id); if (el) el.textContent = v; });
}
const tagsBox = document.getElementById('profileInterests');
if (tagsBox && (!isDemoProfile || !isOwnProfile)) tagsBox.innerHTML = (user.interests || '').split(',').map(x => x.trim()).filter(Boolean).map(x => '<span class="interest-tag">' + escapeHtml(x) + '</span>').join('') || 'Пока не указаны';
const campusCity = document.querySelector('.campus-info-city'); if(campusCity) campusCity.textContent = user.city || 'Калининград';
if (document.getElementById('profileBio')) document.getElementById('profileBio').textContent = user.bio || (isOwnProfile && isDemoProfile ? 'Пишу код, собираю команду и превращаю идеи в проекты.' : 'Пользователь пока не рассказал о себе.');
if (document.getElementById('profileJoined')) document.getElementById('profileJoined').textContent = '@' + (user.username || 'student') + (acc ? ' · На StudHub с ' + new Date(acc.createdAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }) : '');
const about = document.getElementById('profileAboutText'); if (about) about.textContent = user.bio || 'Пользователь пока не рассказал о себе.';
const projects = getProjects();
document.getElementById('profileProjectsCount').textContent = projects.length;
document.getElementById('profileTabProjectsCount').textContent = projects.length;
}

// Edit Profile Modal
function openEditProfileModal() {
if (typeof viewingProfile !== 'undefined' && viewingProfile) return;
const user = getCurrentUser();
document.getElementById('editProfileName').value = user.name || '';
document.getElementById('editProfileSubtitle').value = user.subtitle || '';
document.getElementById('editProfileBio').value = user.bio || '';
document.getElementById('editProfileUsername').value = user.username || '';
document.getElementById('editProfileCampus').value = user.campus || 'kitis';
document.getElementById('editProfileInterests').value = user.interests || '';
document.getElementById('editProfileCity').value = user.city || 'Калининград';

document.getElementById('editProfileModal').classList.add('show');
}
function closeEditProfileModal() { document.getElementById('editProfileModal').classList.remove('show'); }
async function saveProfile() {
const user = getCurrentUser();
user.name = document.getElementById('editProfileName').value.trim() || user.name;
user.subtitle = document.getElementById('editProfileSubtitle').value.trim();
user.bio = document.getElementById('editProfileBio').value.trim();
const newUsername = document.getElementById('editProfileUsername').value.trim().replace(/^@/, '').toLowerCase();
if (!/^[a-z0-9_.]{3,20}$/.test(newUsername)) { showToast('Юзернейм: 3–20 символов, только латиница, цифры, точка и подчёркивание', 'error'); return; }
if (typeof BACKEND !== 'undefined' && BACKEND) {
  const usernameResult = await backendUpdateUsername(newUsername);
  if (usernameResult.error) { showToast(usernameResult.error === 'auth.err.usernameTaken' ? 'Этот юзернейм уже занят' : 'Не удалось сохранить юзернейм', 'error'); return; }
}
user.username = newUsername;
user.city = document.getElementById('editProfileCity').value.trim();
user.campus = document.getElementById('editProfileCampus').value;
user.interests = document.getElementById('editProfileInterests').value.trim();
if (BACKEND && sb && typeof backendSavePublicProfile === 'function') {
  const result = await backendSavePublicProfile(user);
  if (result && result.error) { console.error('Ошибка сохранения профиля:', result.error); showToast('Не удалось сохранить профиль: ' + (result.message || result.error.message || 'проверьте настройки Supabase'), 'error'); return; }
  if (result && result.avatar_url) user.avatar_url = result.avatar_url;
}
saveCurrentUser(user);
closeEditProfileModal();
updateProfile();
renderAllCommunities();
showToast('Профиль обновлён!', 'success');
}
