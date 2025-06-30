import { sequelize } from '../../config/database.js';
import {
  Scheduling,
  Clinic,
  ServiceType,
  SchedulingStatus,
  User,
  Plan,
  Pet,
  PetOwner,
  PaymentMethod,
  PaymentStatus,
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

// Modificação do método createScheduling para aceitar transação
const createScheduling = async ({ schedulingData, transaction = null }) => {
  try {
    const options = transaction ? { transaction } : {};

    const newScheduling = await Scheduling.create(schedulingData, options);

    if (!newScheduling) {
      throw new Error('Failed to create scheduling');
    }

    return newScheduling;
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Modificação do método getSchedulingById para aceitar transação
const getSchedulingById = async ({ id, transaction = null }) => {
  try {
    const options = {
      where: { id },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: ServiceType,
          as: 'serviceType',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: SchedulingStatus,
          as: 'schedulingStatus',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name'],
        },
        {
          model: Pet,
          as: 'pet',
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
        {
          model: PetOwner,
          as: 'petOwner',
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
        },
        {
          model: PaymentMethod,
          as: 'paymentMethod',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PaymentStatus,
          as: 'paymentStatus',
          attributes: ['id', 'name', 'label'],
        },
      ],
    };

    if (transaction) {
      options.transaction = transaction;
    }

    const scheduling = await Scheduling.findOne(options);
    if (!scheduling) {
      throw new Error('Scheduling not found');
    }

    return scheduling;
  } catch (error) {
    throw new Error(`Error fetching scheduling by id: ${error.message}`);
  }
};

const getAllSchedulings = async ({ date, status }) => {
  try {
    const whereCondition = {};

    if (date) {
      whereCondition.appointment_date = date;
    }

    if (status) {
      whereCondition.scheduling_status_id = status;
    }

    const schedulings = await Scheduling.findAll({
      where: whereCondition,
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: ServiceType,
          as: 'serviceType',
          attributes: ['id', 'name', 'label', 'color', 'emoji'],
        },
        {
          model: SchedulingStatus,
          as: 'schedulingStatus',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name'],
        },
        {
          model: Pet,
          as: 'pet',
          attributes: ['id', 'name'],
        },
        {
          model: PetOwner,
          as: 'petOwner',
          attributes: ['id', 'email'],
        },
        {
          model: PaymentMethod,
          as: 'paymentMethod',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: PaymentStatus,
          as: 'paymentStatus',
          attributes: ['id', 'name', 'label'],
        },
      ],
      order: [
        ['appointment_date', 'ASC'],
        ['start_time', 'ASC'],
      ],
    });

    return schedulings;
  } catch (error) {
    throw new Error(`Error fetching schedulings: ${error.message}`);
  }
};

const getSchedulingsByClinic = async ({ clinicId, date, status }) => {
  try {
    const whereCondition = {
      clinic_id: clinicId,
    };

    if (date) {
      whereCondition.appointment_date = date;
    }

    if (status) {
      whereCondition.scheduling_status_id = status;
    }

    const schedulings = await Scheduling.findAll({
      where: whereCondition,
      include: [
        {
          model: ServiceType,
          as: 'serviceType',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: SchedulingStatus,
          as: 'schedulingStatus',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Pet,
          as: 'pet',
          attributes: ['id', 'name'],
        },
        {
          model: PetOwner,
          as: 'petOwner',
          attributes: ['id', 'email'],
        },
      ],
      order: [
        ['appointment_date', 'ASC'],
        ['start_time', 'ASC'],
      ],
    });

    return schedulings;
  } catch (error) {
    throw new Error(`Error fetching clinic schedulings: ${error.message}`);
  }
};

const getSchedulingsByPetOwner = async ({ petOwnerId, date, status }) => {
  try {
    const whereCondition = {
      pet_owner_id: petOwnerId,
    };

    if (date) {
      whereCondition.appointment_date = date;
    }

    if (status) {
      whereCondition.scheduling_status_id = status;
    }

    const schedulings = await Scheduling.findAll({
      where: whereCondition,
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: ServiceType,
          as: 'serviceType',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: SchedulingStatus,
          as: 'schedulingStatus',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: Pet,
          as: 'pet',
          attributes: ['id', 'name'],
        },
      ],
      order: [
        ['appointment_date', 'ASC'],
        ['start_time', 'ASC'],
      ],
    });

    return schedulings;
  } catch (error) {
    throw new Error(`Error fetching pet owner schedulings: ${error.message}`);
  }
};

const getSchedulingsByPet = async ({ petId, date, status }) => {
  try {
    const whereCondition = {
      pet_id: petId,
    };

    if (date) {
      whereCondition.appointment_date = date;
    }

    if (status) {
      whereCondition.scheduling_status_id = status;
    }

    const schedulings = await Scheduling.findAll({
      where: whereCondition,
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'name'],
        },
        {
          model: ServiceType,
          as: 'serviceType',
          attributes: ['id', 'name', 'label'],
        },
        {
          model: SchedulingStatus,
          as: 'schedulingStatus',
          attributes: ['id', 'name', 'label'],
        },
      ],
      order: [
        ['appointment_date', 'ASC'],
        ['start_time', 'ASC'],
      ],
    });

    return schedulings;
  } catch (error) {
    throw new Error(`Error fetching pet schedulings: ${error.message}`);
  }
};

// const getSchedulingById = async ({ id }) => {
//   try {
//     const scheduling = await Scheduling.findOne({
//       where: { id },
//       include: [
//         {
//           model: Clinic,
//           as: 'clinic',
//           attributes: ['id', 'name'],
//         },
//         {
//           model: ServiceType,
//           as: 'serviceType',
//           attributes: ['id', 'name', 'label'],
//         },
//         {
//           model: SchedulingStatus,
//           as: 'schedulingStatus',
//           attributes: ['id', 'name', 'label'],
//         },
//         {
//           model: User,
//           as: 'user',
//           attributes: ['id', 'name', 'email'],
//         },
//         {
//           model: Plan,
//           as: 'plan',
//           attributes: ['id', 'name'],
//         },
//         {
//           model: Pet,
//           as: 'pet',
//           attributes: ['id', 'name'],
//         },
//         {
//           model: PetOwner,
//           as: 'petOwner',
//           attributes: ['id', 'email'],
//         },
//         {
//           model: PaymentMethod,
//           as: 'paymentMethod',
//           attributes: ['id', 'name', 'label'],
//         },
//         {
//           model: PaymentStatus,
//           as: 'paymentStatus',
//           attributes: ['id', 'name', 'label'],
//         },
//       ],
//     });

//     if (!scheduling) {
//       throw new Error('Scheduling not found');
//     }

//     return scheduling;
//   } catch (error) {
//     throw new Error(`Error fetching scheduling by id: ${error.message}`);
//   }
// };

const updateScheduling = async ({ id, schedulingData }) => {
  try {
    const allowedFields = [
      'clinic_id',
      'service_type_id',
      'scheduling_status_id',
      'user_id',
      'plan_id',
      'pet_id',
      'pet_owner_id',
      'payment_method_id',
      'payment_status_id',
      'appointment_date',
      'start_time',
      'end_time',
      'price',
      'notes',
      'is_confirmed',
    ];

    const sanitizedData = Object.keys(schedulingData)
      .filter((key) => allowedFields.includes(key) && schedulingData[key] !== undefined)
      .reduce(
        (obj, key) => ({
          ...obj,
          [key]: schedulingData[key],
        }),
        {},
      );
    console.log('sanitizedData', sanitizedData);
    const [updated] = await Scheduling.update(sanitizedData, {
      where: { id },
      returning: true,
    });

    if (!updated) {
      throw new Error('Scheduling not found');
    }

    const updatedScheduling = await getSchedulingById({ id });
    return updatedScheduling;
  } catch (error) {
    throw new Error(`Error updating scheduling: ${error.message}`);
  }
};

const deleteScheduling = async ({ id }) => {
  try {
    const deleted = await Scheduling.destroy({
      where: { id },
    });

    if (!deleted) {
      throw new Error('Scheduling not found');
    }

    return true;
  } catch (error) {
    throw new Error(`Error deleting scheduling: ${error.message}`);
  }
};

export default {
  createScheduling,
  getAllSchedulings,
  getSchedulingsByClinic,
  getSchedulingsByPetOwner,
  getSchedulingsByPet,
  getSchedulingById,
  updateScheduling,
  deleteScheduling,
};
