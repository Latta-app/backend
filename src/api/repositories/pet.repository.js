import {
  Pet,
  PetOwner,
  PetType,
  PetBreed,
  PetGender,
  PetColor,
  PetSize,
  PetFurType,
  PetFurLength,
  PetTemperament,
  PetSocializationLevel,
  PetLivingEnvironment,
  PetBloodType,
} from '../models/index.js';

const createPet = async ({ petData }) => {
  try {
    const newPet = await Pet.create(petData);

    if (!newPet) {
      throw new Error('Failed to create pet');
    }

    return await getPetById({ id: newPet.id });
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getAllPets = async () => {
  try {
    const pets = await Pet.findAll({
      include: [
        {
          model: PetOwner,
          as: 'pet_owner_id',
          attributes: ['id', 'email'],
        },
        {
          model: PetType,
          as: 'type',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetBreed,
          as: 'breed',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetGender,
          as: 'gender',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetColor,
          as: 'color',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetSize,
          as: 'size',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetFurType,
          as: 'furType',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetFurLength,
          as: 'furLength',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetTemperament,
          as: 'temperament',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetSocializationLevel,
          as: 'socializationLevel',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetLivingEnvironment,
          as: 'livingEnvironment',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetBloodType,
          as: 'bloodType',
          attributes: ['id', 'name', 'label'],
        },
      ],
      attributes: [
        'id',
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

    return pets;
  } catch (error) {
    throw new Error(`Error fetching pets: ${error.message}`);
  }
};

const getPetById = async ({ id }) => {
  try {
    const pet = await Pet.findOne({
      where: { id },
      attributes: [
        'id',
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
        'updated_at',
      ],
      include: [
        {
          model: PetType,
          required: true,
          as: 'type',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetBreed,
          required: true,
          as: 'breed',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetGender,
          required: true,
          as: 'gender',
          attributes: ['id', 'name', 'label', 'position'],
        },
        {
          model: PetColor,
          required: true,
          as: 'color',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PetSize,
          required: true,
          as: 'size',
          attributes: ['id', 'name', 'label', 'position'],
        },
        {
          model: PetFurType,
          required: true,
          as: 'furType',
          attributes: ['id', 'name', 'label', 'position'],
        },
        {
          model: PetFurLength,
          required: true,
          as: 'furLength',
          attributes: ['id', 'name', 'label', 'position'],
        },
        {
          model: PetTemperament,
          required: true,
          as: 'temperament',
          attributes: ['id', 'name', 'label', 'position'],
        },
        {
          model: PetSocializationLevel,
          required: true,
          as: 'socializationLevel',
          attributes: ['id', 'name', 'label', 'position'],
        },
        {
          model: PetLivingEnvironment,
          required: true,
          as: 'livingEnvironment',
          attributes: ['id', 'name', 'label', 'position'],
        },
        {
          model: PetBloodType,
          as: 'bloodType',
          attributes: ['id', 'name', 'label'],
        },
      ],
    });

    if (!pet) {
      throw new Error('Pet not found');
    }

    return pet;
  } catch (error) {
    throw new Error(`Error fetching pet by id: ${error.message}`);
  }
};

const getPetOptions = async () => {
  try {
    const [
      types,
      sizes,
      furTypes,
      furLengths,
      genders,
      breeds,
      colors,
      socializationLevels,
      temperaments,
      livingEnvironments,
      bloodTypes,
    ] = await Promise.all([
      PetType.findAll({
        attributes: ['id', 'name', 'label'],
        order: [['label', 'ASC']],
      }),
      PetSize.findAll({
        attributes: ['id', 'name', 'label', 'position'],
        order: [['label', 'ASC']],
      }),
      PetFurType.findAll({
        attributes: ['id', 'name', 'label'],
        order: [['label', 'ASC']],
      }),
      PetFurLength.findAll({
        attributes: ['id', 'name', 'label', 'position'],
        order: [['label', 'ASC']],
      }),
      PetGender.findAll({
        attributes: ['id', 'name', 'label', 'position'],
        order: [['label', 'ASC']],
      }),
      PetBreed.findAll({
        attributes: ['id', 'name', 'label', 'pet_type_id'],
        include: [
          {
            model: PetType,
            as: 'type',
            attributes: ['id', 'name', 'label'],
          },
        ],
        order: [['label', 'ASC']],
      }),
      PetColor.findAll({
        attributes: ['id', 'name', 'label'],
        order: [['label', 'ASC']],
      }),
      PetSocializationLevel.findAll({
        attributes: ['id', 'name', 'label', 'position'],
        order: [['label', 'ASC']],
      }),
      PetTemperament.findAll({
        attributes: ['id', 'name', 'label', 'position'],
        order: [['label', 'ASC']],
      }),
      PetLivingEnvironment.findAll({
        attributes: ['id', 'name', 'label', 'position'],
        order: [['label', 'ASC']],
      }),
      PetBloodType.findAll({
        attributes: ['id', 'name', 'label', 'pet_type_id'],
        include: [
          {
            model: PetType,
            as: 'type',
            attributes: ['id', 'name', 'label'],
          },
        ],
        order: [['label', 'ASC']],
      }),
    ]);

    return {
      types,
      sizes,
      furTypes,
      furLengths,
      genders,
      breeds,
      colors,
      socializationLevels,
      temperaments,
      livingEnvironments,
      bloodTypes,
    };
  } catch (error) {
    throw new Error(`Error fetching pet options: ${error.message}`);
  }
};

const updatePet = async ({ id, petData }) => {
  try {
    const allowedFields = [
      'name',
      'date_of_birthday',
      'pet_type_id',
      'pet_breed_id',
      'pet_gender_id',
      'pet_size_id',
      'pet_fur_type_id',
      'pet_fur_length_id',
      'pet_color_id',
      'pet_temperament_id',
      'pet_socialization_level_id',
      'pet_living_environment_id',
      'latest_weight',
      'microchip_number',
      'blood_type',
      'is_neutered',
      'is_active',
      'photo',
      'death_date',
    ];

    const sanitizedData = Object.keys(petData)
      .filter((key) => allowedFields.includes(key) && petData[key] !== undefined)
      .reduce(
        (obj, key) => ({
          ...obj,
          [key]: petData[key],
        }),
        {},
      );

    const [updated] = await Pet.update(sanitizedData, {
      where: { id },
      returning: true,
    });

    if (!updated) {
      throw new Error('Pet not found');
    }

    const updatedPet = await getPetById({ id });
    return updatedPet;
  } catch (error) {
    throw new Error(`Error updating pet: ${error.message}`);
  }
};

const deletePet = async ({ id }) => {
  try {
    const deleted = await Pet.destroy({
      where: { id },
    });

    if (!deleted) {
      throw new Error('Pet not found');
    }

    return true;
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
