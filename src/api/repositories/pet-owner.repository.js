import {
  PetOwner,
  Pet,
  Clinic,
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

const createPetOwner = async ({ petOwnerData }) => {
  try {
    const newPetOwner = await PetOwner.create(petOwnerData);

    if (!newPetOwner) {
      throw new Error('Failed to create pet owner');
    }

    return await getPetOwnerById({ id: newPetOwner.id });
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

const getAllPetOwners = async ({ clinicId }) => {
  try {
    const petOwners = await PetOwner.findAll({
      where: {
        clinic_id: clinicId,
        is_active: true,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Pet,
          as: 'pets',
          attributes: [
            'id',
            'name',
            'date_of_birthday',
            'photo',
            'latest_weight',
            'microchip_number',
            'is_neutered',
            'is_active',
            'death_date',
          ],
          through: { attributes: ['pet_owner_id', 'pet_id'] },
          include: [
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
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetColor,
              as: 'color',
              attributes: ['id', 'name', 'label'],
            },
            {
              model: PetSize,
              as: 'size',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetFurType,
              as: 'furType',
              attributes: ['id', 'name', 'label'],
            },
            {
              model: PetFurLength,
              as: 'furLength',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetTemperament,
              as: 'temperament',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetSocializationLevel,
              as: 'socializationLevel',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetLivingEnvironment,
              as: 'livingEnvironment',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetBloodType,
              as: 'bloodType',
              attributes: ['id', 'name', 'label'],
            },
          ],
        },
      ],
      attributes: [
        'id',
        'name',
        'email',
        'cell_phone',
        'cpf',
        'rg',
        'date_of_birth',
        'address_street',
        'address_number',
        'address_complement',
        'address_neighborhood',
        'address_city',
        'address_state',
        'address_zipcode',
        'emergency_contact_name',
        'emergency_contact_phone',
        'occupation',
        'is_active',
        'has_platform_access',
        'created_at',
        'updated_at',
      ],
      order: [['name', 'ASC']],
    });

    return petOwners;
  } catch (error) {
    throw new Error(`Error fetching pet owners: ${error.message}`);
  }
};

const getPetOwnerById = async ({ id, clinicId }) => {
  try {
    const petOwner = await PetOwner.findOne({
      where: {
        id,
        clinic_id: clinicId,
        is_active: true,
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Pet,
          as: 'pets',
          attributes: [
            'id',
            'name',
            'date_of_birthday',
            'photo',
            'latest_weight',
            'microchip_number',
            'is_neutered',
            'is_active',
            'death_date',
          ],
          through: { attributes: ['pet_owner_id', 'pet_id'] },
          include: [
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
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetColor,
              as: 'color',
              attributes: ['id', 'name', 'label'],
            },
            {
              model: PetSize,
              as: 'size',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetFurType,
              as: 'furType',
              attributes: ['id', 'name', 'label'],
            },
            {
              model: PetFurLength,
              as: 'furLength',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetTemperament,
              as: 'temperament',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetSocializationLevel,
              as: 'socializationLevel',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetLivingEnvironment,
              as: 'livingEnvironment',
              attributes: ['id', 'name', 'label', 'position'],
            },
            {
              model: PetBloodType,
              as: 'bloodType',
              attributes: ['id', 'name', 'label'],
            },
          ],
        },
      ],
      attributes: [
        'id',
        'name',
        'email',
        'cell_phone',
        'cpf',
        'rg',
        'date_of_birth',
        'address_street',
        'address_number',
        'address_complement',
        'address_neighborhood',
        'address_city',
        'address_state',
        'address_zipcode',
        'emergency_contact_name',
        'emergency_contact_phone',
        'occupation',
        'is_active',
        'has_platform_access',
      ],
    });

    return petOwner;
  } catch (error) {
    throw new Error(`Error fetching pet owner by id: ${error.message}`);
  }
};

const updatePetOwner = async ({ id, clinicId, petOwnerData }) => {
  try {
    const [updated] = await PetOwner.update(petOwnerData, {
      where: {
        id,
        clinic_id: clinicId,
        is_active: true,
      },
    });

    if (!updated) {
      throw new Error('Pet owner not found');
    }

    const updatedPetOwner = await getPetOwnerById({ id, clinicId });
    return updatedPetOwner;
  } catch (error) {
    throw new Error(`Error updating pet owner: ${error.message}`);
  }
};

const deletePetOwner = async ({ id, clinicId }) => {
  try {
    const deleted = await PetOwner.update(
      { is_active: false },
      {
        where: {
          id,
          clinic_id: clinicId,
          is_active: true,
        },
      },
    );

    if (!deleted[0]) {
      throw new Error('Pet owner not found');
    }

    return true;
  } catch (error) {
    throw new Error(`Error deleting pet owner: ${error.message}`);
  }
};

const searchPetOwners = async ({ searchTerm, clinicId }) => {
  try {
    const petOwners = await PetOwner.findAll({
      where: {
        clinic_id: clinicId,
        is_active: true,
        [Op.or]: [
          { name: { [Op.iLike]: `%${searchTerm}%` } },
          { email: { [Op.iLike]: `%${searchTerm}%` } },
          { cpf: { [Op.iLike]: `%${searchTerm}%` } },
        ],
      },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: Pet,
          as: 'pets',
          through: { attributes: [] },
        },
      ],
      attributes: [
        'id',
        'name',
        'email',
        'cell_phone',
        'cpf',
        'rg',
        'date_of_birth',
        'address_street',
        'address_number',
        'address_complement',
        'address_neighborhood',
        'address_city',
        'address_state',
        'address_zipcode',
        'emergency_contact_name',
        'emergency_contact_phone',
        'occupation',
        'is_active',
        'has_platform_access',
        'created_at',
        'updated_at',
      ],
      order: [['name', 'ASC']],
    });

    if (!petOwners.length) {
      return [];
    }

    return petOwners;
  } catch (error) {
    throw new Error(`Error searching pet owners: ${error.message}`);
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
