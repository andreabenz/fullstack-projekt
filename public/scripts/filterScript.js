document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('filterForm');
    if (!form) return;
    form.addEventListener('change', function () {
        form.submit();
    });
});