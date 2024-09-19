function highlightMonths() {
    const months = document.querySelectorAll('.month');
    months.forEach(month => month.classList.remove('highlight'));

    const startMonth = document.getElementById('startMonth').value;
    const endMonth = document.getElementById('endMonth').value;

    if (startMonth && endMonth) {
        const startDate = new Date(startMonth);
        const endDate = new Date(endMonth);

        for (let m = startDate.getMonth(); m <= endDate.getMonth(); m++) {
            const monthDiv = document.getElementById(`month-${m + 1}`);
            if (monthDiv) {
                monthDiv.classList.add('highlight');
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const elements = document.querySelectorAll('[data-clipboard-text]');
    elements.forEach(element => {
        element.addEventListener('click', function() {
            copyToClipboard(this);
        });
    });
});

