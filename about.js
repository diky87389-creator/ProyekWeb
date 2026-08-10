const activeUserKey = 'dikyActiveUser';
const userMenu = document.getElementById('user-menu');

function getActiveUser() {
  const raw = localStorage.getItem(activeUserKey);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Data pengguna aktif tidak valid.', error);
    localStorage.removeItem(activeUserKey);
    return null;
  }
}

function requireLogin() {
  if (!getActiveUser()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function renderUserMenu() {
  const user = getActiveUser();
  clearElement(userMenu);

  if (!user) {
    const loginLink = document.createElement('a');
    loginLink.href = 'login.html';
    loginLink.textContent = 'Masuk';

    const registerLink = document.createElement('a');
    registerLink.href = 'daftar.html';
    registerLink.textContent = 'Daftar';

    userMenu.append(loginLink, registerLink);
    return;
  }

  const profileLink = document.createElement('a');
  profileLink.href = 'profile.html';
  profileLink.textContent = `Halo, ${user.fullName}`;
  userMenu.append(profileLink);
}

window.addEventListener('DOMContentLoaded', () => {
  if (!requireLogin()) return;
  renderUserMenu();
});
