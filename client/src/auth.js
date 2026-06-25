export function getAuth() {
  const token = localStorage.getItem('token');
  const userType = localStorage.getItem('userType');
  return { token, userType };
}

export function setAuth(token, userType) {
  localStorage.setItem('token', token);
  localStorage.setItem('userType', userType);
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('userType');
}