import Joi from 'joi';
import ClinicInterestLeadService from '../services/clinic-interest-lead.service.js';

const leadSchema = Joi.object({
  section: Joi.string().min(1).max(120).required(),
  name: Joi.string().min(1).max(200).required(),
  email: Joi.string().email().max(200).required(),
  message: Joi.string().max(2000).allow(null, ''),
  clinic_id: Joi.string().uuid().allow(null, ''),
  clinic_name: Joi.string().max(200).allow(null, ''),
}).options({ stripUnknown: true });

const submitInterestLead = async (req, res) => {
  const { error, value } = leadSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  }

  const clinicId =
    value.clinic_id ||
    req.user?.clinic_id ||
    req.user?.role?.clinic_id ||
    null;
  const userId = req.user?.id || null;

  try {
    const { lead, emailResult } = await ClinicInterestLeadService.submitLead({
      section: value.section,
      name: value.name,
      email: value.email,
      message: value.message,
      clinicId,
      clinicName: value.clinic_name,
      userId,
      userAgent: req.headers['user-agent']?.slice(0, 500) || null,
      ipAddress: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || null,
    });

    return res.status(201).json({
      code: 'CLINIC_INTEREST_LEAD_RECEIVED',
      data: {
        id: lead?.id || null,
        email_dispatched: emailResult.sent,
      },
    });
  } catch (err) {
    console.error('[clinic.controller] submitInterestLead failed:', err.message);
    return res.status(500).json({ code: 'CLINIC_LEAD_ERROR', message: err.message });
  }
};

export default { submitInterestLead };
