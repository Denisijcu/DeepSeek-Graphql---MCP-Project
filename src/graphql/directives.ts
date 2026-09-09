// src/graphql/directives.ts
import { GraphQLDirective, DirectiveLocation, GraphQLString } from 'graphql';

export const AuthDirective = new GraphQLDirective({
  name: 'auth',
  description: 'Requiere autenticación para acceder al campo',
  locations: [DirectiveLocation.FIELD_DEFINITION],
  args: {
    role: { type: GraphQLString, defaultValue: 'user' },
  },
});

// Esta directiva es de ejemplo; en la práctica necesitarías un middleware
// que verifique la autenticación antes de ejecutar el resolver.