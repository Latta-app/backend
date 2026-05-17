import ClinicExternalRepository from '../repositories/clinic-external.repository.js';
import {
  validateExternalPet,
  validateExternalContact,
} from '../validators/clinic-external.validations.js';
import { logFromReq } from '../services/clinic-activity-log.service.js';

const resolveClinicId = (req) =>
  req.user?.clinic_id || req.user?.role?.clinic_id || req.body?.clinic_id || null;

const requireClinicId = (req, res) => {
  const clinicId = resolveClinicId(req);
  if (!clinicId) {
    res
      .status(400)
      .json({ code: 'CLINIC_ID_REQUIRED', message: 'JWT sem clinic_id e body sem clinic_id' });
    return null;
  }
  return clinicId;
};

const handleError = (res, error, code) => {
  if (error.code === 'NOT_FOUND') {
    return res.status(404).json({ code: 'NOT_FOUND', message: error.message });
  }
  if (error.code === 'FORBIDDEN') {
    return res.status(403).json({ code: 'FORBIDDEN', message: error.message });
  }
  console.error(`[clinic-external] ${code}:`, error.message);
  return res.status(500).json({ code, message: error.message });
};

// ------- pets ----------------------------------------------------------------

export const listExternalPets = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  try {
    const rows = await ClinicExternalRepository.listExternalPets({
      clinicId,
      q: req.query.q || null,
    });
    return res.json({ code: 'EXTERNAL_PETS_FETCHED', data: rows });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_PETS_FETCH_ERROR');
  }
};

export const createExternalPet = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  const { error, value } = validateExternalPet(req.body);
  if (error) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  }
  try {
    const created = await ClinicExternalRepository.createExternalPet({ clinicId, data: value });
    logFromReq(req, 'external_pet_created', { pet_id: created.id });
    return res.status(201).json({ code: 'EXTERNAL_PET_CREATED', data: created });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_PET_CREATE_ERROR');
  }
};

export const updateExternalPet = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  const { error, value } = validateExternalPet(req.body, { partial: true });
  if (error) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  }
  try {
    const updated = await ClinicExternalRepository.updateExternalPet({
      clinicId,
      id: req.params.id,
      data: value,
    });
    return res.json({ code: 'EXTERNAL_PET_UPDATED', data: updated });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_PET_UPDATE_ERROR');
  }
};

export const deleteExternalPet = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  try {
    await ClinicExternalRepository.deleteExternalPet({ clinicId, id: req.params.id });
    return res.json({ code: 'EXTERNAL_PET_DELETED' });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_PET_DELETE_ERROR');
  }
};

// ------- contacts ------------------------------------------------------------

export const listExternalContacts = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  try {
    const rows = await ClinicExternalRepository.listExternalContacts({
      clinicId,
      q: req.query.q || null,
    });
    return res.json({ code: 'EXTERNAL_CONTACTS_FETCHED', data: rows });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_CONTACTS_FETCH_ERROR');
  }
};

export const createExternalContact = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  const { error, value } = validateExternalContact(req.body);
  if (error) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  }
  try {
    const created = await ClinicExternalRepository.createExternalContact({
      clinicId,
      data: value,
    });
    logFromReq(req, 'external_contact_created', { contact_id: created.id });
    return res.status(201).json({ code: 'EXTERNAL_CONTACT_CREATED', data: created });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_CONTACT_CREATE_ERROR');
  }
};

export const updateExternalContact = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  const { error, value } = validateExternalContact(req.body, { partial: true });
  if (error) {
    return res.status(400).json({ code: 'VALIDATION_ERROR', error: error.details });
  }
  try {
    const updated = await ClinicExternalRepository.updateExternalContact({
      clinicId,
      id: req.params.id,
      data: value,
    });
    return res.json({ code: 'EXTERNAL_CONTACT_UPDATED', data: updated });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_CONTACT_UPDATE_ERROR');
  }
};

export const deleteExternalContact = async (req, res) => {
  const clinicId = requireClinicId(req, res);
  if (!clinicId) return undefined;
  try {
    await ClinicExternalRepository.deleteExternalContact({ clinicId, id: req.params.id });
    return res.json({ code: 'EXTERNAL_CONTACT_DELETED' });
  } catch (err) {
    return handleError(res, err, 'EXTERNAL_CONTACT_DELETE_ERROR');
  }
};

export default {
  listExternalPets,
  createExternalPet,
  updateExternalPet,
  deleteExternalPet,
  listExternalContacts,
  createExternalContact,
  updateExternalContact,
  deleteExternalContact,
};
