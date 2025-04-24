document.addEventListener('DOMContentLoaded', function() {
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const closeSidebar = document.getElementById('closeSidebar');

  // サイドバーを開く
  mobileMenuBtn.addEventListener('click', function() {
    sidebar.classList.add('active');
    overlay.classList.add('active');
  });

  // サイドバーを閉じる
  closeSidebar.addEventListener('click', function() {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
  });

  // オーバーレイをクリックしてサイドバーを閉じる
  overlay.addEventListener('click', function() {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
  });
});