document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('filterForm');
    if (!form) return;
    form.addEventListener('change', async function () {

        const params = new URLSearchParams();
        form.querySelectorAll('input[type="checkbox"]').forEach(box => {
            if (box.checked) {params.append('filter', box.value)}
        });
        const response = await fetch ('/posts?' + params.toString(), {
            headers: {'X-Requested-With': 'XMLHttpRequest'}
        });
        const html = await response.text()

        document.getElementById('content').innerHTML = html;
    });
});