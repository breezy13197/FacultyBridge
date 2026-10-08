// Keep workflow navigation separate from the imported question-processing logic.
(() => {
  const needsQuestions = id => ['review', 'validate', 'export'].includes(id);
  function updateNavigation() {
    const empty = state.questions.length === 0;
    document.querySelectorAll('[data-screen], .go[data-to]').forEach(button => {
      const locked = empty && needsQuestions(button.dataset.screen || button.dataset.to);
      button.disabled = locked;
      if (locked) button.title = 'Upload or paste questions to continue';
      else button.removeAttribute('title');
    });
  }

  const showScreen = show;
  show = function(id) {
    updateNavigation();
    showScreen(needsQuestions(id) && !state.questions.length ? 'upload' : id);
  };

  const renderQuestions = renderReview;
  renderReview = function() {
    renderQuestions();
    updateNavigation();
    const active = document.querySelector('.qb-screen.is-active');
    if (!state.questions.length && needsQuestions(active?.id)) show('upload');
  };

  updateNavigation();
})();
