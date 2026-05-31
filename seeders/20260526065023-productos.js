'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert('producto', [
      {
        id: 1,
        titulo: "Televisor Oled Smart Tv LG 42'' 4k Uhd",
        descripcion: 'El Televisor Oled Smart Tv LG 42 pulgadas 4K UHD es un producto de última tecnología que permite disfrutar una experiencia visual de alta calidad.',
        precio: 13080,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 2,
        titulo: 'Xiaomi Poco M5s 8gb 256gb 6.43 Amoled 64mp 5000mah 33w Azul',
        descripcion: 'Pantalla AMOLED 6.43 Full HD+, cámara cuádruple de 64 Mpx y batería de 5000 mAh con carga rápida.',
        precio: 2399,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 3,
        titulo: 'Apple MacBook Air 13 pulgadas 2020 Chip M1 256 GB SSD 8 GB RAM Gris espacial',
        descripcion: 'Notebook delgada y ligera de Apple con chip M1, CPU de 8 núcleos, GPU avanzada y Neural Engine de 16 núcleos.',
        precio: 25999,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 4,
        titulo: 'Haley Taurus Licuadora Vaso Plástico De 1.25 Litros 4 Velocidades Color Negro',
        descripcion: 'Licuadora Taurus con potencia de 350 watts, vaso plástico y 4 velocidades para preparar diferentes recetas.',
        precio: 365,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 5,
        titulo: 'Silla De Escritorio Ejecutiva Ergonómica Styrka Kova Color Negro',
        descripcion: 'Silla ergonómica para oficina o casa, diseñada para brindar comodidad durante la jornada laboral.',
        precio: 1957,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 6,
        titulo: 'Bolsa Andrea Para Mujer Grabado Cocodrilo Doble Asa Beige',
        descripcion: 'Bolsa elegante con textura tipo cocodrilo, doble asa y diseño moderno.',
        precio: 427,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 7,
        titulo: 'Balón Futbol Forza Laminado F5g 1500 N.5 Molten Pro Color Bordó',
        descripcion: 'Balón de fútbol Molten ideal para entrenamiento y juego recreativo.',
        precio: 521.82,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 8,
        titulo: 'Lámpara De Pared De Interior Cristal Decorativa Moderna',
        descripcion: 'Aplique decorativo de cristal para interiores, con diseño moderno y buena transmisión de luz.',
        precio: 142.08,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 9,
        titulo: 'Trituradora Papel Gbc Corte Cruzado Hasta 12 Hojas',
        descripcion: 'Trituradora de papel con corte cruzado para proteger documentos con información confidencial.',
        precio: 2923.20,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 10,
        titulo: 'Play-Doh Moto Scooter Repartidora De Pizzas',
        descripcion: 'Juguete Play-Doh con temática de pizzas para crear y repartir comida de juguete.',
        precio: 2454.68,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 11,
        titulo: 'Silla Alta Para Comer 5 En 1 Periquera Bebé Niños',
        descripcion: 'Silla alta tipo periquera para bebé con bandeja desmontable y arnés de seguridad.',
        precio: 1999,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 12,
        titulo: 'Báscula Digital Renpho Es-cs20m Negra Hasta 180 Kg',
        descripcion: 'Báscula digital para consultar peso corporal y datos de composición corporal mediante aplicación.',
        precio: 320.11,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 13,
        titulo: 'Labial Líquido Mac Powder Kiss',
        descripcion: 'Labial MAC para uso diario o nocturno, disponible en tonos nude y vibrantes.',
        precio: 559,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 14,
        titulo: 'Videojuego Mario Kart 8 Deluxe Nintendo Switch Físico',
        descripcion: 'Juego Mario Kart 8 Deluxe para Nintendo Switch con modo multijugador local y online.',
        precio: 849,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 15,
        titulo: 'Café Soluble Nescafé Taster’s Choice Café Colombiano 190g',
        descripcion: 'Café soluble colombiano con sabor, aroma y cuerpo distintivos gracias a su proceso de liofilización.',
        precio: 232.10,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('producto', null, {});
  }
};