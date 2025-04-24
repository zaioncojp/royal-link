document.addEventListener('DOMContentLoaded', function() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('overlay');
  const closeSidebarBtn = document.getElementById('closeSidebar');

  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', function() {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });
  }

  if (closeSidebarBtn && sidebar) {
    closeSidebarBtn.addEventListener('click', function() {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      document.body.classList.remove('menu-open');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', function() {
      sidebar.classList.remove('active');
      overlay.classList.remove('active');
      document.body.classList.remove('menu-open');
    });
  }
});