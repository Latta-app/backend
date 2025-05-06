import petOwnerService from '../services/pet-owner.service.js';

const createPetOwner = async (req, res) => {
  try {
    const { clinic_id } = req.user;
    const petOwner = await petOwnerService.createPetOwner({
      petOwnerData: req.body,
      clinicId: clinic_id,
    });

    return res.status(201).json(petOwner);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const getAllPetOwners = async (req, res) => {
  try {
    const { clinic_id } = req.user;
    const petOwners = await petOwnerService.getAllPetOwners({
      clinicId: clinic_id,
    });

    return res.status(200).json(petOwners);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getPetOwnerById = async (req, res) => {
  try {
    const { id } = req.params;
    const { clinic_id } = req.user;

    const petOwner = await petOwnerService.getPetOwnerById({
      id,
      clinicId: clinic_id,
    });

    return res.status(200).json(petOwner);
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
};

const updatePetOwner = async (req, res) => {
  try {
    const { id } = req.params;
    const { clinic_id } = req.user;
    console.log('chegou', id);

    const updatedPetOwner = await petOwnerService.updatePetOwner({
      id,
      clinicId: clinic_id,
      petOwnerData: req.body,
    });

    return res.status(200).json(updatedPetOwner);
  } catch (error) {
    console.log('error', error);
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(400).json({ error: error.message });
  }
};

const deletePetOwner = async (req, res) => {
  try {
    const { id } = req.params;
    const { clinic_id } = req.user;

    const result = await petOwnerService.deletePetOwner({
      id,
      clinicId: clinic_id,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
};

const searchPetOwners = async (req, res) => {
  try {
    const { term } = req.params;
    const { clinic_id } = req.user;

    const petOwners = await petOwnerService.searchPetOwners({
      searchTerm: term,
      clinicId: clinic_id,
    });

    return res.status(200).json(petOwners);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

export default {
  createPetOwner,
  getAllPetOwners,
  getPetOwnerById,
  updatePetOwner,
  deletePetOwner,
  searchPetOwners,
};
