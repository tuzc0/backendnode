'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class pedido extends Model {
    static associate(models) {
      pedido.belongsTo(models.usuario, { foreignKey: 'usuarioid', as: 'usuario' });
      pedido.hasMany(models.pedidodetalle, { foreignKey: 'pedidoid', as: 'detalles' });
    }
  }

  pedido.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    usuarioid: {
      type: DataTypes.STRING,
      allowNull: false
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    estado: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'PENDIENTE'
    }
  }, {
    sequelize,
    freezeTableName: true,
    modelName: 'pedido'
  });

  return pedido;
};
