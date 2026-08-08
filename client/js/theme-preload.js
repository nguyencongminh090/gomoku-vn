(function() {
  var storedTheme = localStorage.getItem('theme');
  document.documentElement.setAttribute('data-theme', storedTheme ? storedTheme : 'light');
})();
