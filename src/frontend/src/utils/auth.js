const TOKEN_KEY = "lpr_token";
const ROLE_KEY = "lpr_role";
const USERNAME_KEY = "lpr_username";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setAuth = (token, role, username) => {
  localStorage.setItem(TOKEN_KEY, token);
  if (role) {
    localStorage.setItem(ROLE_KEY, role);
  }
  if (username) {
    localStorage.setItem(USERNAME_KEY, username);
  }
};

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(USERNAME_KEY);
};

export const getCachedProfile = () => ({
  username: localStorage.getItem(USERNAME_KEY) || "Operator",
  role: localStorage.getItem(ROLE_KEY) || "user",
});
