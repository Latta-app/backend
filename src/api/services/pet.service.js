import PetRepository from '../repositories/pet.repository.js';

const createPet = async ({ petData }) => {
  try {
    return await PetRepository.createPet({ petData });
  } catch (error) {
    throw new Error(`Error creating pet: ${error.message}`);
  }
};

const getAllPets = async () => {
  try {
    return await PetRepository.getAllPets();
  } catch (error) {
    throw new Error(`Error getting pets: ${error.message}`);
  }
};

const getPetById = async ({ id }) => {
  try {
    const pet = await PetRepository.getPetById({ id });

    if (!pet) {
      throw new Error('Pet not found');
    }

    return pet;
  } catch (error) {
    throw new Error(`Error getting pet by id: ${error.message}`);
  }
};

const getPetOptions = async () => {
  try {
    const options = await PetRepository.getPetOptions();

    const requiredLists = [
      'types',
      'sizes',
      'furTypes',
      'furLengths',
      'genders',
      'breeds',
      'colors',
      'socializationLevels',
      'temperaments',
      'livingEnvironments',
    ];

    const missingLists = requiredLists.filter(
      (list) => !options[list] || !Array.isArray(options[list]),
    );

    if (missingLists.length > 0) {
      throw new Error(`Missing required options: ${missingLists.join(', ')}`);
    }

    const emptyLists = requiredLists.filter((list) => options[list].length === 0);

    if (emptyLists.length > 0) {
      throw new Error(`Empty options lists: ${emptyLists.join(', ')}`);
    }

    const requiredFields = ['id', 'name', 'label'];

    requiredLists.forEach((listName) => {
      options[listName].forEach((item, index) => {
        const missingFields = requiredFields.filter((field) => !item[field]);
        if (missingFields.length > 0) {
          throw new Error(
            `Missing required fields ${missingFields.join(', ')} in ${listName} at index ${index}`,
          );
        }
      });
    });

    options.breeds.forEach((breed, index) => {
      if (!breed.pet_type_id) {
        throw new Error(`Missing pet_type_id in breed at index ${index}`);
      }
    });

    return options;
  } catch (error) {
    if (
      error.message.includes('Missing required options') ||
      error.message.includes('Empty options lists') ||
      error.message.includes('Missing required fields') ||
      error.message.includes('Missing pet_type_id')
    ) {
      throw new Error(`Validation error: ${error.message}`);
    }
    throw new Error(`Error getting pet options: ${error.message}`);
  }
};

const updatePet = async ({ id, petData }) => {
  try {
    return await PetRepository.updatePet({ id, petData });
  } catch (error) {
    throw new Error(`Error updating pet: ${error.message}`);
  }
};

const deletePet = async ({ id }) => {
  try {
    return await PetRepository.deletePet({ id });
  } catch (error) {
    throw new Error(`Error deleting pet: ${error.message}`);
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
