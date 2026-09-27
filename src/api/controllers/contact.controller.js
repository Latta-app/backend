import ContactService from '../services/contact.service.js';

const toggleAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        code: 'MISSING_CONTACT_ID',
        message: 'contact_id is required',
      });
    }

    // A conversa: o número da Latta em que ela acontece. Ausente = número do tutor.
    const numero = req.body?.business_phone_number_id ?? req.query?.business_phone_number_id ?? null;
    const result = await ContactService.toggleAttendance({ contact_id: id, numero });

    return res.status(200).json({
      code: 'ATTENDANCE_TOGGLED',
      data: result,
    });
  } catch (error) {
    console.error('Error toggling attendance:', error);
    if (error?.status === 400) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({
      code: 'ATTENDANCE_TOGGLE_ERROR',
      message: error.message,
    });
  }
};

const setAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_being_attended, business_phone_number_id } = req.body;

    if (!id) {
      return res.status(400).json({
        code: 'MISSING_CONTACT_ID',
        message: 'contact_id is required',
      });
    }

    if (typeof is_being_attended !== 'boolean') {
      return res.status(400).json({
        code: 'INVALID_ATTENDANCE_FLAG',
        message: 'is_being_attended must be boolean',
      });
    }

    const result = await ContactService.setAttendance({
      contact_id: id,
      is_being_attended,
      numero: business_phone_number_id ?? null,
    });

    return res.status(200).json({
      code: 'ATTENDANCE_SET',
      data: result,
    });
  } catch (error) {
    console.error('Error setting attendance:', error);
    if (error?.status === 400) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({
      code: 'ATTENDANCE_SET_ERROR',
      message: error.message,
    });
  }
};

const setResponsibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, path } = req.body;
    if (!id) {
      return res.status(400).json({
        code: 'MISSING_CONTACT_ID',
        message: 'contact_id is required',
      });
    }
    const result = await ContactService.setResponsibility({
      contact_id: id,
      user_id: user_id || null,
      path: path || null,
    });
    return res.status(200).json({
      code: 'RESPONSIBILITY_SET',
      data: result,
    });
  } catch (error) {
    console.error('Error setting responsibility:', error);
    return res.status(500).json({
      code: 'RESPONSIBILITY_SET_ERROR',
      message: error.message,
    });
  }
};

export default {
  toggleAttendance,
  setAttendance,
  setResponsibility,
};
