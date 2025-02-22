// pet-owner.service.js
import calculateAge from '../../utils/calculateAge.js';
import PetOwnerRepository from '../repositories/pet-owner.repository.js';

const validatePetOwnerData = (data) => {
  const requiredFields = [
    'name',
    'email',
    'date_of_birth',
    'address_street',
    'address_number',
    'address_neighborhood',
    'address_city',
    'address_state',
    'address_zipcode',
  ];

  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`Field ${field} is required`);
    }
  }

  if (data.cpf && !/^\d{11}$/.test(data.cpf.replace(/\D/g, ''))) {
    throw new Error('Invalid CPF format');
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new Error('Invalid email format');
  }
};

const createPetOwner = async ({ petOwnerData, clinicId }) => {
  try {
    validatePetOwnerData(petOwnerData);

    const newPetOwner = {
      ...petOwnerData,
      clinic_id: clinicId,
      is_active: true,
    };

    const createdPetOwner = await PetOwnerRepository.createPetOwner({
      petOwnerData: newPetOwner,
    });

    return createdPetOwner;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllPetOwners = async ({ clinicId }) => {
  try {
    return await PetOwnerRepository.getAllPetOwners({ clinicId });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const getPetOwnerById = async ({ id, clinicId }) => {
  try {
    const petOwner = await PetOwnerRepository.getPetOwnerById({ id, clinicId });

    if (!petOwner) {
      throw new Error('Pet owner not found');
    }

    const petsArray = petOwner.dataValues ? petOwner.dataValues.pets : petOwner.pets;

    const formattedPetOwner = petOwner.toJSON ? petOwner.toJSON() : { ...petOwner };

    formattedPetOwner.pets = petsArray.map((pet) => {
      const petData = pet.toJSON ? pet.toJSON() : { ...pet };
      petData.age = petData.date_of_birthday ? calculateAge(petData.date_of_birthday) : null;
      return petData;
    });

    return formattedPetOwner;
  } catch (error) {
    console.log('error', error);
    throw new Error(`Service error: ${error.message}`);
  }
};

const updatePetOwner = async ({ id, clinicId, petOwnerData }) => {
  try {
    validatePetOwnerData(petOwnerData);

    const petOwner = await PetOwnerRepository.getPetOwnerById({ id, clinicId });

    if (!petOwner) {
      throw new Error('Pet owner not found');
    }

    const updatedPetOwner = await PetOwnerRepository.updatePetOwner({
      id,
      clinicId,
      petOwnerData: {
        ...petOwnerData,
        clinic_id: clinicId,
      },
    });

    return updatedPetOwner;
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const deletePetOwner = async ({ id, clinicId }) => {
  try {
    const petOwner = await PetOwnerRepository.getPetOwnerById({ id, clinicId });

    if (!petOwner) {
      throw new Error('Pet owner not found');
    }

    await PetOwnerRepository.deletePetOwner({ id, clinicId });
    return { message: 'Pet owner successfully deleted' };
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
  }
};

const searchPetOwners = async ({ searchTerm, clinicId }) => {
  try {
    if (!searchTerm) {
      throw new Error('Search term is required');
    }

    return await PetOwnerRepository.searchPetOwners({ searchTerm, clinicId });
  } catch (error) {
    throw new Error(`Service error: ${error.message}`);
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
