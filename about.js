const userMenu = document.getElementById('user-menu');

function requireLogin() {
  if (!isValidSession()) {
    console.warn('requireLogin: Sesi tidak valid, redirect ke login');
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
  const user = window.getActiveUser();
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
