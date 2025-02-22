import PetService from '../services/pet.service.js';
import { validatePetCreate, validatePetUpdate } from '../validators/pet.validations.js';

const createPet = async (req, res) => {
  try {
    const { error, value } = validatePetCreate(req.body);
    if (error) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: error.details,
      });
    }

    const newPet = await PetService.createPet({ petData: value });

    return res.status(201).json({
      code: 'PET_CREATED',
      data: newPet,
    });
  } catch (error) {
    console.error('Error creating pet:', error);
    return res.status(500).json({
      code: 'PET_CREATION_ERROR',
      message: error.message,
    });
  }
};

const getAllPets = async (_req, res) => {
  try {
    const pets = await PetService.getAllPets();
    return res.status(200).json({
      code: 'PETS_FETCHED',
      data: pets,
    });
  } catch (error) {
    console.error('Error fetching pets:', error);
    return res.status(500).json({
      code: 'FETCH_ERROR',
      message: error.message,
    });
  }
};

const getPetById = async ({ id }) => {
  try {
    const pet = await Pet.findOne({
      where: { id },
      include: [
        {
          model: PetOwner,
          as: 'owners',
          through: { attributes: [] },
          attributes: ['id', 'email'],
        },
        {
          model: PetType,
          as: 'type', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetBreed,
          as: 'breed', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetGender,
          as: 'gender', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetColor,
          as: 'color', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetSize,
          as: 'size', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetFurType,
          as: 'furType', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetFurLength,
          as: 'furLength', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetTemperament,
          as: 'temperament', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetSocializationLevel,
          as: 'socializationLevel', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetLivingEnvironment,
          as: 'livingEnvironment', // Exatamente como definido no modelo
          attributes: ['id', 'name', 'label'],
        },
      ],
      attributes: [
        'id',
        'pet_type_id',
        'pet_gender_id',
        'pet_breed_id',
        'pet_color_id',
        'pet_size_id',
        'pet_fur_type_id',
        'pet_fur_length_id',
        'pet_temperament_id',
        'pet_socialization_level_id',
        'pet_living_environment_id',
        'name',
        'date_of_birthday',
        'photo',
        'latest_weight',
        'microchip_number',
        'blood_type',
        'is_neutered',
        'is_active',
        'death_date',
        'created_at',
      ],
    });

    return pet;
  } catch (error) {
    throw new Error(`Error fetching pet by id: ${error.message}`);
  }
};

const getPetOptions = async (_req, res) => {
  try {
    const options = await PetService.getPetOptions();
    return res.status(200).json({
      code: 'PET_OPTIONS_FETCHED',
      data: options,
    });
  } catch (error) {
    console.error('Error fetching pet options:', error);
    return res.status(500).json({
      code: 'FETCH_OPTIONS_ERROR',
      message: error.message,
    });
  }
};

const updatePet = async (req, res) => {
  try {
    const { id } = req.params;

    const { error, value } = validatePetUpdate(req.body);
    console.log('value', value);
    if (error) {
      console.log('VALUE ERROR', error);
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: error.details,
      });
    }

    const updatedPet = await PetService.updatePet({ id, petData: value });

    return res.status(200).json({
      code: 'PET_UPDATED',
      data: updatedPet,
    });
  } catch (error) {
    console.error('Error updating pet:', error);
    if (error.message === 'Pet not found') {
      return res.status(404).json({
        code: 'PET_NOT_FOUND',
        message: 'Pet não encontrado',
      });
    }
    return res.status(500).json({
      code: 'UPDATE_ERROR',
      message: error.message,
    });
  }
};

const deletePet = async (req, res) => {
  try {
    const { id } = req.params;
    await PetService.deletePet({ id });

    return res.status(200).json({
      code: 'PET_DELETED',
      message: 'Pet deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting pet:', error);
    if (error.message === 'Pet not found') {
      return res.status(404).json({
        code: 'PET_NOT_FOUND',
        message: 'Pet não encontrado',
      });
    }
    return res.status(500).json({
      code: 'DELETE_ERROR',
      message: error.message,
    });
  }
};

export default {
  createPet,
  getAllPets,
  getPetById,
  getPetOptions,
  updatePet,
  deletePet,
};
