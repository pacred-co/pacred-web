(function () {
  try {
    var d = document.documentElement;
    d.classList.remove("dark");
    d.classList.add("light");
    d.style.colorScheme = "light";
  } catch (e) {}
})();
