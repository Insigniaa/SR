/** Herlaadknop voor 404.html, 500.html en offline.html.
 *  Apart bestandje omdat een inline onclick de Content-Security-Policy breekt. */
document.getElementById('retry')?.addEventListener('click', () => location.reload());
