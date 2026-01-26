fetch('assets/data/last_updated.txt')
  .then(response => response.text())
  .then(date => {
    document.getElementById('last-updated').textContent = date.trim();
  })
  .catch(err => console.error('Failed to fetch last updated date:', err));
