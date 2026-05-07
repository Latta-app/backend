import AIFeedbackService from '../services/ai-feedback.service.js';

const setThumbs = async (req, res) => {
  try {
    const { cell_phone, thumbs } = req.body;
    if (!cell_phone) {
      return res.status(400).json({
        code: 'MISSING_CELL_PHONE',
        message: 'cell_phone is required',
      });
    }
    if (thumbs !== 'up' && thumbs !== 'down') {
      return res.status(400).json({
        code: 'INVALID_THUMBS',
        message: 'thumbs must be "up" or "down"',
      });
    }
    const result = await AIFeedbackService.setThumbs({ cell_phone, thumbs });
    return res.status(200).json({
      code: 'AI_FEEDBACK_RECORDED',
      data: result,
    });
  } catch (error) {
    console.error('Error recording AI feedback:', error);
    return res.status(500).json({
      code: 'AI_FEEDBACK_ERROR',
      message: error.message,
    });
  }
};

export default {
  setThumbs,
};
